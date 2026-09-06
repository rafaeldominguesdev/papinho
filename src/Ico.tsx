export function Ico({ n, className }: { n: string; className?: string }) {
  const P: Record<string, string> = {
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
    sidebar: "M4 5h16v14H4zM9 5v14",
    plus: "M12 5v14M5 12h14",
    home: "M4 11l8-7 8 7M6 10v10h12V10",
    code: "M9 8l-4 4 4 4M15 8l4 4-4 4",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
    shapes: "M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM13 13h7v7h-7z",
    clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4l3 2",
    wrench: "M15 5a4 4 0 0 0-5.5 4.7L4 15l3 3 5.3-5.3A4 4 0 0 0 17 7l-2.3 2.3-1.7-.3-.3-1.7L15 5Z",
    sliders: "M4 8h9M17 8h3M4 16h3M11 16h9",
    palette: "M12 4a8 8 0 1 0 0 16c1.2 0 1.5-1 1-1.7-.6-.9 0-2.3 1.2-2.3H17a3 3 0 0 0 3-3c0-4.4-3.6-9-8-9Z",
    chevron: "M7 10l5 5 5-5",
    download: "M12 4v11M8 11l4 4 4-4M5 20h14",
    waves: "M6 10v4M10 6v12M14 9v6M18 11v2",
    help: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM9.8 9a2.3 2.3 0 1 1 3.3 2.1c-.8.4-1.1 1-1.1 1.9M12 16h.01",
    pencil: "M4 20l1-4L16 5l3 3L8 19l-4 1Z",
    cap: "M3 9l9-4 9 4-9 4-9-4ZM7 11v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4",
    chat: "M4 5h16v10H9l-4 4V5Z",
    mail: "M4 6h16v12H4zM4 7l8 6 8-6",
    spark: "M12 3v6M12 15v6M3 12h6M15 12h6M6.2 6.2l3.5 3.5M14.3 14.3l3.5 3.5M17.8 6.2l-3.5 3.5M9.7 14.3l-3.5 3.5",
    trash: "M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12",
    bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z",
    book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h11",
    sun: "M12 6.5v-2M12 19.5v-2M6.5 12h-2M19.5 12h-2M7.8 7.8 6.4 6.4M17.6 17.6l-1.4-1.4M16.2 7.8l1.4-1.4M6.4 17.6l1.4-1.4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    check: "M4 7h2M4 12h2M4 17h2M9 7h11M9 12h11M9 17h11",
    sort: "M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l-3 3M17 20l3-3",
    pause: "M9 5v14M15 5v14",
    play: "M8 5l11 7-11 7V5Z",
    stopwatch: "M9 2h6M12 2v3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 10v4l3 2",
    blocks: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "h-[18px] w-[18px]"}
    >
      <path d={P[n] ?? ""} />
    </svg>
  );
}

