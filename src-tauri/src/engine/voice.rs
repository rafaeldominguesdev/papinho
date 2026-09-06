//! Reconhecimento de voz nativo do macOS via `Speech.framework`
//! (`SFSpeechRecognizer`) e `AVAudioEngine`, usando as crates `objc2-*`.
//! On-device quando suportado, `pt-BR`, resultados parciais em streaming.
//!
//! ## Decisão de threading / estado
//!
//! - Todo objeto Objective-C aqui (`Retained<AVAudioEngine>`, `Retained<SFSpeechRecognizer>`,
//!   …) é `!Send` e quer a main thread + um run loop rodando (o run loop do
//!   Tao/Tauri serve). Então montamos e destruímos **tudo** dentro de
//!   `app.run_on_main_thread(...)`.
//! - O handle vivo (`VoiceHandle`) fica num `thread_local!` que só a main thread
//!   toca. Assim nada `!Send` cruza a fronteira dos comandos Tauri — os comandos
//!   só despacham um closure `Send` pra main thread.
//! - `AppHandle` é `Send + Sync + Clone`, então emitir eventos de dentro dos
//!   blocks (result handler roda em fila arbitrária; o tap roda na thread de
//!   áudio) é seguro.
//! - Os blocks (`RcBlock`) de result handler e do tap são guardados no
//!   `VoiceHandle` só pra garantir lifetime — o framework copia/retém, mas
//!   manter a nossa referência viva evita qualquer corrida na teardown.

#[cfg(target_os = "macos")]
mod imp {
    use std::cell::RefCell;
    use std::ptr::NonNull;

    use block2::{DynBlock, RcBlock};
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2::AllocAnyThread;
    use objc2_avf_audio::{
        AVAudioApplication, AVAudioApplicationRecordPermission, AVAudioEngine, AVAudioInputNode,
        AVAudioPCMBuffer, AVAudioTime,
    };
    use objc2_foundation::{NSError, NSLocale, NSString};
    use objc2_speech::{
        SFSpeechAudioBufferRecognitionRequest, SFSpeechRecognitionResult, SFSpeechRecognitionTask,
        SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus,
    };
    use tauri::{AppHandle, Emitter};

    type TapBlock = RcBlock<dyn Fn(NonNull<AVAudioPCMBuffer>, NonNull<AVAudioTime>)>;
    type ResultBlock = RcBlock<dyn Fn(*mut SFSpeechRecognitionResult, *mut NSError)>;

    struct VoiceHandle {
        engine: Retained<AVAudioEngine>,
        input_node: Retained<AVAudioInputNode>,
        request: Retained<SFSpeechAudioBufferRecognitionRequest>,
        task: Retained<SFSpeechRecognitionTask>,
        _result_block: ResultBlock,
        _tap_block: TapBlock,
        active: Arc<AtomicBool>,
    }

    thread_local! {
        static VOICE: RefCell<Option<VoiceHandle>> = const { RefCell::new(None) };
    }

    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    /// `true` depois que a UI pediu pra parar (soltou a tecla / clicou). Enquanto
    /// `false`, um `isFinal` que o reconhecedor emite sozinho (pausa curta no
    /// meio da fala) NÃO encerra — o trecho é guardado e a captação recomeça.
    static MANUAL_STOP: AtomicBool = AtomicBool::new(true);
    /// Trechos já finalizados nesta sessão de fala (juntados no final).
    static SEGMENTS: Mutex<Vec<String>> = Mutex::new(Vec::new());
    /// Quantas vezes já reiniciamos a captação nesta sessão — teto anti-thrash.
    static REBUILDS: AtomicU32 = AtomicU32::new(0);
    const MAX_REBUILDS: u32 = 400;

    /// Modo conversa: cada pausa natural fecha uma fala e emite
    /// `voice_utterance` (a UI manda pro modelo e responde falando). Fora
    /// dele, as pausas só acumulam e o texto sai todo no `voice_final`.
    static CONVERSATION: AtomicBool = AtomicBool::new(false);
    /// Microfone "surdo": o tap continua rodando (o engine não cai), mas o
    /// áudio NÃO é entregue ao reconhecedor. É o que impede o Papinho de se
    /// escutar falando no modo conversa — sem cancelamento de eco, o `say`
    /// saindo pelo alto-falante voltaria pelo microfone e ele responderia a
    /// si mesmo. Mutar/desmutar é instantâneo (só um bool), diferente de
    /// derrubar e remontar o AVAudioEngine a cada frase.
    static MUTED: AtomicBool = AtomicBool::new(false);
    /// Idioma do reconhecimento (Config › Voz). Vazio = pt-BR.
    static VOICE_LANG: Mutex<String> = Mutex::new(String::new());
    /// Pontuação automática (Config › Voz).
    static VOICE_PUNCT: AtomicBool = AtomicBool::new(true);

    fn pause_finished(now: u64, last_sound: u64, last_text: u64) -> bool {
        now.saturating_sub(last_sound) >= 1100 && now.saturating_sub(last_text) >= 650
    }

    #[cfg(test)]
    mod tests {
        use super::pause_finished;

        #[test]
        fn waits_for_both_silence_and_transcription_to_settle() {
            assert!(!pause_finished(2000, 1000, 1000));
            assert!(!pause_finished(2000, 0, 1500));
            assert!(pause_finished(2100, 1000, 1450));
            assert!(!pause_finished(500, 1000, 1000));
        }
    }

    fn emit_error(app: &AppHandle, msg: impl Into<String>) {
        let msg = msg.into();
        crate::engine::diag::log("voz", format!("ERRO: {msg}"));
        let _ = app.emit("voice_error", serde_json::json!({ "message": msg }));
    }

    /// Junta os trechos guardados + `tail` (o trecho atual), separados por
    /// espaço, ignorando vazios.
    fn combine(tail: &str) -> String {
        let segs = SEGMENTS.lock().unwrap();
        let mut parts: Vec<&str> = segs.iter().map(String::as_str).collect();
        let tail = tail.trim();
        if !tail.is_empty() {
            parts.push(tail);
        }
        parts
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Entrega o texto final (tudo que foi acumulado) e limpa o estado.
    fn deliver_final(app: &AppHandle, tail: &str) {
        let full = combine(tail);
        SEGMENTS.lock().unwrap().clear();
        let _ = app.emit("voice_final", serde_json::json!({ "text": full }));
    }

    // ---- atalho: tecla fn (Globe) dispara `voice_hotkey` ----

    type FnMonitorBlock =
        RcBlock<dyn Fn(*mut objc2::runtime::AnyObject) -> *mut objc2::runtime::AnyObject>;

    thread_local! {
        static FN_MONITOR: RefCell<Option<FnMonitorBlock>> = const { RefCell::new(None) };
    }

    /// Instala um monitor local de eventos: quando a janela está em foco e a
    /// pessoa segura a tecla `fn` (keyCode 63, flag Function), emite
    /// `voice_hotkey_down`; quando solta, emite `voice_hotkey_up`
    /// (push-to-talk). Idempotente.
    pub fn install_fn_hotkey(app: AppHandle) {
        let _ = app.clone().run_on_main_thread(move || {
            let already = FN_MONITOR.with(|m| m.borrow().is_some());
            if already {
                return;
            }

            use objc2::runtime::AnyObject;
            use objc2::{class, msg_send};
            use std::sync::atomic::{AtomicBool, Ordering};

            // estado da tecla — detecta a borda (pressionou/soltou), não só
            // "o flag está ligado", porque o FlagsChanged dispara em ambos.
            static WAS_DOWN: AtomicBool = AtomicBool::new(false);
            const KEY_FN: u16 = 63;
            const FLAG_FUNCTION: usize = 1 << 23;
            const MASK_FLAGS_CHANGED: u64 = 1 << 12;

            let app_evt = app.clone();
            let block: FnMonitorBlock =
                RcBlock::new(move |event: *mut AnyObject| -> *mut AnyObject {
                    if !event.is_null() {
                        let code: u16 = unsafe { msg_send![event, keyCode] };
                        if code == KEY_FN {
                            let flags: usize = unsafe { msg_send![event, modifierFlags] };
                            let down = (flags & FLAG_FUNCTION) != 0;
                            let was = WAS_DOWN.swap(down, Ordering::Relaxed);
                            if down && !was {
                                let _ = app_evt.emit("voice_hotkey_down", ());
                            } else if !down && was {
                                let _ = app_evt.emit("voice_hotkey_up", ());
                            }
                        }
                    }
                    event
                });

            let _monitor: *mut AnyObject = unsafe {
                msg_send![
                    class!(NSEvent),
                    addLocalMonitorForEventsMatchingMask: MASK_FLAGS_CHANGED,
                    handler: &*block,
                ]
            };

            FN_MONITOR.with(|m| *m.borrow_mut() = Some(block));
        });
    }

    /// Liga/desliga o "mudo" do microfone (ver `MUTED`). Não toca em nada
    /// Objective-C: pode ser chamado de qualquer thread, a qualquer hora.
    pub fn set_muted(v: bool) {
        MUTED.store(v, Ordering::SeqCst);
    }

    /// Ponto de entrada: só despacha pra main thread.
    pub fn start(
        app: AppHandle,
        lang: Option<String>,
        punctuation: Option<bool>,
        conversation: Option<bool>,
    ) -> Result<(), String> {
        *VOICE_LANG.lock().unwrap() = lang.unwrap_or_default();
        VOICE_PUNCT.store(punctuation.unwrap_or(true), Ordering::SeqCst);
        CONVERSATION.store(conversation.unwrap_or(false), Ordering::SeqCst);
        MUTED.store(false, Ordering::SeqCst);
        crate::engine::diag::log(
            "voz",
            format!(
                "start lang={:?} conversa={}",
                VOICE_LANG.lock().unwrap(),
                CONVERSATION.load(Ordering::SeqCst)
            ),
        );
        let handle = app.clone();
        app.run_on_main_thread(move || request_speech_auth(handle))
            .map_err(|e| e.to_string())
    }

    /// Segura antes de parar de captar de verdade — sem isso, soltar a tecla
    /// fn (push-to-talk) cortava a ponta da fala: a pessoa fala até o fim,
    /// mas o motor de parar de falar chega alguns ms antes do áudio "ficar
    /// pronto"/o buffer terminar. Durante essa folga o engine/tap/request
    /// continuam exatamente como estavam — é captação de verdade, não só um
    /// delay artificial. Se o reconhecedor já tiver decidido sozinho que
    /// acabou (fluxo normal, sem tecla), essa folga só atrasa a limpeza
    /// interna — invisível, o texto final já foi entregue antes.
    const STOP_GRACE_MS: u64 = 850;

    pub fn stop(app: AppHandle) -> Result<(), String> {
        // marca ANTES da folga: qualquer `isFinal` que chegue durante a folga
        // já conta como o fim de verdade, não vira reinício.
        MANUAL_STOP.store(true, Ordering::SeqCst);
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(STOP_GRACE_MS));
            let app2 = app.clone();
            let _ = app.run_on_main_thread(move || finish(app2));
        });
        Ok(())
    }

    /// Para de captar áudio mas deixa o reconhecedor entregar o resultado final
    /// (não usa `cancel`, que descartaria a transcrição). Se não há handle vivo
    /// (estávamos entre reinícios), entrega o que já foi acumulado.
    fn finish(app: AppHandle) {
        let had_handle = VOICE.with(|slot| {
            if let Some(h) = slot.borrow().as_ref() {
                unsafe {
                    h.engine.stop();
                    h.input_node.removeTapOnBus(0);
                    h.request.endAudio();
                    h.task.finish();
                }
                true
            } else {
                false
            }
        });
        // sem handle: o result handler não vai disparar — entrega agora.
        if !had_handle {
            deliver_final(&app, "");
        }
    }

    /// Descarta tudo (usado ao reiniciar ou depois do resultado final).
    fn teardown() {
        VOICE.with(|slot| {
            if let Some(h) = slot.borrow_mut().take() {
                h.active.store(false, Ordering::SeqCst);
                unsafe {
                    h.engine.stop();
                    h.input_node.removeTapOnBus(0);
                    h.task.cancel();
                }
            }
        });
    }

    // --- fluxo de permissões (encadeado por completion handlers) ---------------

    fn request_speech_auth(app: AppHandle) {
        // já rodando? reinicia limpo.
        teardown();
        // nova sessão de fala: zera o acúmulo e libera os reinícios automáticos.
        MANUAL_STOP.store(false, Ordering::SeqCst);
        SEGMENTS.lock().unwrap().clear();
        REBUILDS.store(0, Ordering::SeqCst);

        let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
        crate::engine::diag::log("voz", format!("auth de fala: {status:?}"));
        if status == SFSpeechRecognizerAuthorizationStatus::Authorized {
            request_mic_permission(app);
            return;
        }

        let handler = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
            if status == SFSpeechRecognizerAuthorizationStatus::Authorized {
                let app2 = app.clone();
                let _ = app.run_on_main_thread(move || request_mic_permission(app2));
            } else {
                emit_error(
                    &app,
                    "permissão de reconhecimento de fala negada — ative em Ajustes do Sistema \
                     > Privacidade e Segurança > Reconhecimento de Fala",
                );
            }
        });
        unsafe { SFSpeechRecognizer::requestAuthorization(&handler) };
    }

    fn request_mic_permission(app: AppHandle) {
        let current = unsafe { AVAudioApplication::sharedInstance().recordPermission() };
        crate::engine::diag::log("voz", format!("permissão de microfone: {current:?}"));
        if current == AVAudioApplicationRecordPermission::Granted {
            finish_start(app);
            return;
        }

        let handler = RcBlock::new(move |granted: Bool| {
            if granted.as_bool() {
                let app2 = app.clone();
                let _ = app.run_on_main_thread(move || finish_start(app2));
            } else {
                emit_error(
                    &app,
                    "permissão de microfone negada — ative em Ajustes do Sistema \
                     > Privacidade e Segurança > Microfone",
                );
            }
        });
        unsafe { AVAudioApplication::requestRecordPermissionWithCompletionHandler(&handler) };
    }

    fn finish_start(app: AppHandle) {
        match build_engine(&app) {
            Ok(handle) => {
                crate::engine::diag::log("voz", "engine no ar, captando");
                VOICE.with(|slot| *slot.borrow_mut() = Some(handle))
            }
            Err(e) => emit_error(&app, e),
        }
    }

    // --- montagem do engine + recognition task --------------------------------

    fn build_engine(app: &AppHandle) -> Result<VoiceHandle, String> {
        // Recognizer no idioma da Config (pt-BR por padrão); cai pro default
        // do sistema se o locale não for suportado.
        let lang = VOICE_LANG.lock().unwrap().clone();
        let lang_id = if lang.trim().is_empty() {
            "pt-BR".to_string()
        } else {
            lang
        };
        let locale = NSLocale::localeWithLocaleIdentifier(&NSString::from_str(&lang_id));
        let recognizer =
            unsafe { SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale) }
                .or_else(|| unsafe { Some(SFSpeechRecognizer::new()) })
                .ok_or_else(|| "não foi possível criar o SFSpeechRecognizer".to_string())?;

        crate::engine::diag::log(
            "voz",
            format!(
                "recognizer locale={lang_id} disponível={} on-device={}",
                unsafe { recognizer.isAvailable() },
                unsafe { recognizer.supportsOnDeviceRecognition() },
            ),
        );
        if !unsafe { recognizer.isAvailable() } {
            return Err(
                "reconhecimento de fala indisponível agora (sem rede para o primeiro uso, \
                 ou locale sem suporte)"
                    .into(),
            );
        }

        let request = unsafe { SFSpeechAudioBufferRecognitionRequest::new() };
        unsafe { request.setShouldReportPartialResults(true) };
        if unsafe { recognizer.supportsOnDeviceRecognition() } {
            unsafe { request.setRequiresOnDeviceRecognition(true) };
        }
        // dica de tarefa: ditado contínuo (frases longas, não comando curto) —
        // melhora o endpointing e a acentuação/pontuação.
        unsafe {
            request.setTaskHint(objc2_speech::SFSpeechRecognitionTaskHint::Dictation);
            request.setAddsPunctuation(VOICE_PUNCT.load(Ordering::SeqCst));
        }

        let engine = unsafe { AVAudioEngine::new() };
        let input_node = unsafe { engine.inputNode() };
        let format = unsafe { input_node.outputFormatForBus(0) };
        let active = Arc::new(AtomicBool::new(true));
        let has_text = Arc::new(AtomicBool::new(false));
        let ending = Arc::new(AtomicBool::new(false));
        let last_text = Arc::new(AtomicU64::new(0));
        let started = Instant::now();

        // result handler -> voice_partial / voice_final / voice_error
        //
        // Um `isFinal` só encerra de verdade se a UI já pediu pra parar
        // (`MANUAL_STOP`). Caso contrário (o reconhecedor cortou sozinho numa
        // pausa), guardamos o trecho e reiniciamos a captação — assim a fala
        // que vem DEPOIS da pausa não é perdida.
        let app_res = app.clone();
        let active_res = active.clone();
        let has_text_res = has_text.clone();
        let last_text_res = last_text.clone();
        let result_block: ResultBlock = RcBlock::new(
            move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| {
                if !active_res.load(Ordering::SeqCst) {
                    return;
                }
                if let Some(error) = NonNull::new(error) {
                    let error = unsafe { error.as_ref() };
                    let msg = error.localizedDescription().to_string();
                    // erro depois de já ter texto acumulado + stop pedido:
                    // não joga fora o que já temos.
                    if MANUAL_STOP.load(Ordering::SeqCst) && !SEGMENTS.lock().unwrap().is_empty() {
                        deliver_final(&app_res, "");
                    } else {
                        crate::engine::diag::log("voz", format!("reconhecimento falhou: {msg}"));
                        let _ = app_res.emit("voice_error", serde_json::json!({ "message": msg }));
                    }
                    let _ = app_res.run_on_main_thread(teardown);
                    return;
                }

                let Some(result) = NonNull::new(result) else {
                    return;
                };
                let result = unsafe { result.as_ref() };
                let text = unsafe { result.bestTranscription().formattedString() }.to_string();
                let is_final = unsafe { result.isFinal() };
                if !text.trim().is_empty() {
                    if !has_text_res.swap(true, Ordering::SeqCst) {
                        crate::engine::diag::log("voz", "primeira transcrição recebida");
                    }
                    last_text_res.store(started.elapsed().as_millis() as u64, Ordering::SeqCst);
                }

                if !is_final {
                    let _ = app_res.emit(
                        "voice_partial",
                        serde_json::json!({ "text": combine(&text) }),
                    );
                    return;
                }

                if MANUAL_STOP.load(Ordering::SeqCst) {
                    // fim de verdade — junta tudo e entrega.
                    deliver_final(&app_res, &text);
                    let _ = app_res.run_on_main_thread(teardown);
                    return;
                }

                // final automático = a pessoa fez uma pausa.
                // MODO CONVERSA: isso fecha a fala — emite `voice_utterance`,
                // zera o acúmulo e segue ouvindo (a UI responde falando).
                if CONVERSATION.load(Ordering::SeqCst) {
                    let full = combine(&text);
                    SEGMENTS.lock().unwrap().clear();
                    if !full.trim().is_empty() {
                        crate::engine::diag::log("voz", format!("fala fechada: {full:?}"));
                        let _ =
                            app_res.emit("voice_utterance", serde_json::json!({ "text": full }));
                    }
                    let app_restart = app_res.clone();
                    let _ = app_res.run_on_main_thread(move || {
                        teardown();
                        if !MANUAL_STOP.load(Ordering::SeqCst)
                            && REBUILDS.fetch_add(1, Ordering::SeqCst) < MAX_REBUILDS
                        {
                            finish_start(app_restart);
                        }
                    });
                    return;
                }

                // fora do modo conversa: guarda o trecho, mostra o acumulado
                // como parcial e recomeça a captar.
                let seg = text.trim().to_string();
                if !seg.is_empty() {
                    SEGMENTS.lock().unwrap().push(seg);
                }
                let _ = app_res.emit("voice_partial", serde_json::json!({ "text": combine("") }));

                let app_restart = app_res.clone();
                let _ = app_res.run_on_main_thread(move || {
                    teardown();
                    if MANUAL_STOP.load(Ordering::SeqCst) {
                        deliver_final(&app_restart, "");
                    } else if REBUILDS.fetch_add(1, Ordering::SeqCst) < MAX_REBUILDS {
                        finish_start(app_restart);
                    } else {
                        deliver_final(&app_restart, "");
                    }
                });
            },
        );

        let task =
            unsafe { recognizer.recognitionTaskWithRequest_resultHandler(&request, &result_block) };

        // tap no input node: alimenta o request + calcula RMS -> voice_level
        let app_lvl = app.clone();
        let request_tap = request.clone();
        let active_tap = active.clone();
        let last_sound = AtomicU64::new(0);
        let tap_block: TapBlock = RcBlock::new(
            move |buffer: NonNull<AVAudioPCMBuffer>, _when: NonNull<AVAudioTime>| {
                // mutado (o Papinho está falando): não alimenta o
                // reconhecedor nem mexe no medidor — a UI mostra o estado
                // "falando" e o orbe reage à fala, não ao microfone.
                if !active_tap.load(Ordering::SeqCst) || MUTED.load(Ordering::SeqCst) {
                    return;
                }
                let buffer = unsafe { buffer.as_ref() };
                if !ending.load(Ordering::SeqCst) {
                    unsafe { request_tap.appendAudioPCMBuffer(buffer) };
                }

                let frames = unsafe { buffer.frameLength() } as usize;
                let channels = unsafe { buffer.floatChannelData() };
                if frames == 0 || channels.is_null() {
                    return;
                }
                let ch0 = unsafe { (*channels).as_ptr() };
                let mut sum = 0f64;
                let mut peak = 0f32;
                for i in 0..frames {
                    let s = unsafe { *ch0.add(i) };
                    sum += (s as f64) * (s as f64);
                    let a = s.abs();
                    if a > peak {
                        peak = a;
                    }
                }
                let rms = (sum / frames as f64).sqrt();
                // Medidor em dBFS mapeado numa faixa útil de fala
                // (~-55 dBFS = silêncio .. -8 dBFS = alto). A escala antiga
                // (`(rms*6).sqrt()` aqui + ganho 2.6 no front) saturava em
                // 100% com qualquer fala normal — parecia estouro sem ser.
                let dbfs = if rms > 1e-7 {
                    20.0 * rms.log10()
                } else {
                    -120.0
                };
                let level = (((dbfs + 55.0) / 47.0) as f32).clamp(0.0, 1.0);
                let now = started.elapsed().as_millis() as u64;
                if dbfs > -40.0 {
                    last_sound.store(now, Ordering::SeqCst);
                }
                // isFinal não é um detector de pausa: encerra explicitamente
                // o áudio depois de texto reconhecido e silêncio sustentado.
                if CONVERSATION.load(Ordering::SeqCst)
                    && !MANUAL_STOP.load(Ordering::SeqCst)
                    && has_text.load(Ordering::SeqCst)
                    && pause_finished(
                        now,
                        last_sound.load(Ordering::SeqCst),
                        last_text.load(Ordering::SeqCst),
                    )
                    && !ending.swap(true, Ordering::SeqCst)
                {
                    crate::engine::diag::log("voz", "pausa detectada, finalizando transcrição");
                    unsafe { request_tap.endAudio() };
                }
                // Clipe DE VERDADE: amostra encostou no teto (±1.0). Isso sim
                // distorce o áudio e atrapalha o reconhecimento — a UI usa pra
                // avisar de baixar o volume de entrada do macOS.
                let clip = peak >= 0.985;
                let _ = app_lvl.emit(
                    "voice_level",
                    serde_json::json!({ "level": level, "clip": clip }),
                );
            },
        );

        let tap_ptr: *mut DynBlock<dyn Fn(NonNull<AVAudioPCMBuffer>, NonNull<AVAudioTime>)> =
            RcBlock::as_ptr(&tap_block);
        unsafe {
            input_node.installTapOnBus_bufferSize_format_block(0, 1024, Some(&format), tap_ptr);
        }

        unsafe { engine.prepare() };
        if let Err(e) = unsafe { engine.startAndReturnError() } {
            unsafe { input_node.removeTapOnBus(0) };
            unsafe { task.cancel() };
            return Err(format!(
                "falha ao iniciar o AVAudioEngine: {}",
                e.localizedDescription()
            ));
        }

        Ok(VoiceHandle {
            engine,
            input_node,
            request,
            task,
            _result_block: result_block,
            _tap_block: tap_block,
            active,
        })
    }
}

/// Começa a captar e transcrever. Pede autorização de fala + microfone, monta o
/// `AVAudioEngine` e instala a recognition task. Emite `voice_partial`,
/// `voice_final`, `voice_level` e `voice_error`.
#[tauri::command]
pub async fn voice_start(
    app: tauri::AppHandle,
    lang: Option<String>,
    punctuation: Option<bool>,
    conversation: Option<bool>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        imp::start(app, lang, punctuation, conversation)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, lang, punctuation, conversation);
        Err("reconhecimento de voz nativo só está disponível no macOS".into())
    }
}

/// Instala o atalho da tecla `fn` (Globe) que dispara o evento `voice_hotkey`
/// enquanto a janela do DevTerm está em foco. Chamar uma vez no boot da UI.
#[tauri::command]
pub async fn voice_hotkey_start(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        imp::install_fn_hotkey(app);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
}

/// Modo conversa: fecha o microfone enquanto o Papinho fala (senão ele se
/// escuta) e reabre quando termina. Mantém a captação viva — só para de
/// entregar áudio ao reconhecedor.
#[tauri::command]
pub async fn voice_mute(muted: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        imp::set_muted(muted);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = muted;
    }
    Ok(())
}

/// Para o engine, remove o tap, finaliza o request e cancela a task.
#[tauri::command]
pub async fn voice_stop(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        imp::stop(app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
}
