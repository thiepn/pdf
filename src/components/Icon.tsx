export type IconName =
  | "home" | "documents" | "tools" | "settings" | "help"
  | "read" | "edit" | "pages" | "secure" | "ocr" | "compress"
  | "inspect" | "repair" | "professional" | "preservation" | "native"
  | "compliance" | "toolbox" | "arrow-left" | "chevron-left"
  | "chevron-right" | "minus" | "plus" | "more" | "shield" | "close"
  | "select" | "hand" | "text" | "image" | "link" | "signature"
  | "stamp" | "rectangle" | "ellipse" | "line" | "arrow" | "highlight"
  | "underline" | "strikeout" | "squiggly" | "pen" | "comment" | "redaction"
  | "undo" | "redo" | "download" | "save" | "create" | "merge"
  | "scan" | "batch" | "compare";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `studio-icon ${className}` : "studio-icon"}
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: IconName) {
  const common = { stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.8 };
  switch (name) {
    case "home": return <><path {...common} d="m3 11 9-7 9 7"/><path {...common} d="M5.5 9.5V20h13V9.5M9.5 20v-6h5v6"/></>;
    case "documents": return <><path {...common} d="M7 3.5h7l4 4V20.5H7z"/><path {...common} d="M14 3.5v4h4M10 12h5M10 15.5h5"/></>;
    case "tools": case "toolbox": return <><path {...common} d="m14.2 6.1 3.7-3.7 3.7 3.7-3.7 3.7"/><path {...common} d="m13 11 4.9-4.9M11.4 12.6 4 20l-2-2 7.4-7.4"/><circle {...common} cx="8" cy="8" r="3"/></>;
    case "settings": return <><circle {...common} cx="12" cy="12" r="3"/><path {...common} d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3.1 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>;
    case "help": return <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.9.8-.9 1.6M12 17h.01"/></>;
    case "read": return <><path {...common} d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v15H7.5A3.5 3.5 0 0 0 4 20.5zM20 5.5A3.5 3.5 0 0 0 16.5 4H13v15h3.5a3.5 3.5 0 0 1 3.5 1.5z"/></>;
    case "edit": return <><path {...common} d="m14 5 5 5M4 20l3.5-.7L19 7.8a2.1 2.1 0 0 0-3-3L4.7 16.3z"/></>;
    case "pages": return <><rect {...common} x="7" y="4" width="12" height="15" rx="1.5"/><path {...common} d="M4 7v12.5A1.5 1.5 0 0 0 5.5 21H16M10 8h6M10 11h6"/></>;
    case "secure": case "shield": return <><path {...common} d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"/><path {...common} d="m9.5 12 1.7 1.7 3.6-4"/></>;
    case "ocr": return <><path {...common} d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path {...common} d="M8 12h8M8 15h5"/></>;
    case "compress": return <><path {...common} d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/></>;
    case "inspect": return <><circle {...common} cx="10.5" cy="10.5" r="6.5"/><path {...common} d="m15.5 15.5 5 5M10.5 7.5v3l2 1"/></>;
    case "repair": return <><path {...common} d="M20 11a8 8 0 1 0-2.3 5.7"/><path {...common} d="M20 5v6h-6"/></>;
    case "professional": return <><path {...common} d="M4 7.5h16v12H4zM8 7.5V5h8v2.5M4 12h16M10 12v2h4v-2"/></>;
    case "preservation": return <><path {...common} d="M12 3c4 2.2 7 2.1 7 2.1v6.3c0 4.2-2.6 7.5-7 9.6-4.4-2.1-7-5.4-7-9.6V5.1S8 5.2 12 3Z"/><path {...common} d="M9 12h6"/></>;
    case "native": return <><path {...common} d="M7 3.5h7l4 4V20.5H7zM14 3.5v4h4"/><path {...common} d="m10 15 2-4 2 4M10.8 13.5h2.4"/></>;
    case "compliance": return <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="m8 12 2.5 2.5L16.5 8"/></>;
    case "arrow-left": return <><path {...common} d="M20 12H4M10 6l-6 6 6 6"/></>;
    case "chevron-left": return <path {...common} d="m15 18-6-6 6-6"/>;
    case "chevron-right": return <path {...common} d="m9 18 6-6-6-6"/>;
    case "minus": return <path {...common} d="M5 12h14"/>;
    case "plus": return <path {...common} d="M12 5v14M5 12h14"/>;
    case "more": return <><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></>;
    case "close": return <path {...common} d="m6 6 12 12M18 6 6 18"/>;
    case "select": return <path {...common} d="m5 3 13 8-6 2-3 6z"/>;
    case "hand": return <path {...common} d="M8 11V6.5a1.5 1.5 0 0 1 3 0V10M11 9V5.5a1.5 1.5 0 0 1 3 0V10M14 9V7a1.5 1.5 0 0 1 3 0v5M8 10.5 6.8 9.3a1.6 1.6 0 0 0-2.3 2.2l4.3 6A4 4 0 0 0 12 19h2a5 5 0 0 0 5-5v-3a1.5 1.5 0 0 0-3 0"/>;
    case "text": return <><path {...common} d="M5 5h14M12 5v14M8 19h8"/></>;
    case "image": return <><rect {...common} x="3.5" y="4" width="17" height="16" rx="2"/><circle {...common} cx="9" cy="9" r="1.5"/><path {...common} d="m5.5 17 4.2-4.2 2.8 2.7 2.4-2.4 3.6 3.9"/></>;
    case "link": return <><path {...common} d="m9.5 14.5-1 1a3.5 3.5 0 1 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/><path {...common} d="m14.5 9.5 1-1a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M8.5 15.5l7-7"/></>;
    case "signature": return <><path {...common} d="M3 17c3.5-1 5.5-3.2 6.5-7 .5-2 0-3-1-3s-2 1.7-1.7 4.3C7.2 15 9.4 18 11 17c1.5-.9 1.2-3.5 2.3-3.7 1-.2 1.2 2.7 2.5 2.7 1.2 0 1.5-1.5 2.3-1.5.7 0 1.2.8 2.9.5M3 20h18"/></>;
    case "stamp": return <><path {...common} d="M8 13c.8-1.7 1-3 1-5a3 3 0 0 1 6 0c0 2 .2 3.3 1 5M6 13h12v4H6zM5 20h14"/></>;
    case "rectangle": return <rect {...common} x="4" y="5" width="16" height="14" rx="1"/>;
    case "ellipse": return <ellipse {...common} cx="12" cy="12" rx="8" ry="6.5"/>;
    case "line": return <path {...common} d="M5 19 19 5"/>;
    case "arrow": return <><path {...common} d="M5 19 19 5M12 5h7v7"/></>;
    case "highlight": return <><path {...common} d="m7 15 7-10 4 3-7 10zM4 20h16M5 17l3 2"/></>;
    case "underline": return <><path {...common} d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/></>;
    case "strikeout": return <><path {...common} d="M16.5 7.5C16 5.8 14.5 5 12 5c-2.8 0-4.5 1.2-4.5 3 0 3.8 9 1.8 9 6 0 2-1.8 3-4.7 3-2.4 0-4-1-4.5-2.8M4 12h16"/></>;
    case "squiggly": return <><path {...common} d="M7 4v7a5 5 0 0 0 10 0V4M4 20c1.3-2 2.7-2 4 0s2.7 2 4 0 2.7-2 4 0 2.7 2 4 0"/></>;
    case "pen": return <><path {...common} d="m14 5 5 5-9 9-6 1 1-6zM12 7l5 5"/></>;
    case "comment": return <path {...common} d="M4 5h16v12H9l-5 4z"/>;
    case "redaction": return <><rect {...common} x="4" y="5" width="16" height="14" rx="1"/><path {...common} d="M7 9h10M7 12h10M7 15h7" strokeWidth="3"/></>;
    case "undo": return <><path {...common} d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6"/></>;
    case "redo": return <><path {...common} d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6"/></>;
    case "download": return <><path {...common} d="M12 3v12M7 10l5 5 5-5M4 20h16"/></>;
    case "save": return <><path {...common} d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-7h8v7"/></>;
    case "create": return <><path {...common} d="M6 3.5h8l4 4V20H6zM14 3.5v4h4"/><path {...common} d="M9 14h6M12 11v6"/></>;
    case "merge": return <><path {...common} d="M5 4h6v6H5zM13 14h6v6h-6zM16 4v4a4 4 0 0 1-4 4H8v4"/><path {...common} d="m5 13 3 3-3 3"/></>;
    case "scan": return <><path {...common} d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path {...common} d="M7 12h10M7 15h10"/></>;
    case "batch": return <><rect {...common} x="6" y="5" width="13" height="15" rx="1.5"/><path {...common} d="M3 8v10M9 9h7M9 13h7M9 17h4"/></>;
    case "compare": return <><path {...common} d="M4 5h7v14H4zM13 5h7v14h-7zM8 9h1M15 15h2"/></>;
  }
}
