import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.75V20h11V10.75" />
    </BaseIcon>
  );
}

export function IconList(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 7h12" />
      <path d="M8 12h12" />
      <path d="M8 17h12" />
      <path d="M4.5 7h1" />
      <path d="M4.5 12h1" />
      <path d="M4.5 17h1" />
    </BaseIcon>
  );
}

export function IconTemplate(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
      <path d="M9 5v14" />
    </BaseIcon>
  );
}

export function IconCampaign(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 12 18 6.5v11L4.5 12Z" />
      <path d="M8 11.2V18l3-2" />
    </BaseIcon>
  );
}

export function IconMedia(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m8 14 2.5-2.5L14 17h4" />
      <circle cx="9" cy="9" r="1.25" />
    </BaseIcon>
  );
}

export function IconAnalytics(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 19V5" />
      <path d="M5 19h14" />
      <path d="M8 15l3-4 3 2 4-6" />
      <path d="M18 7h-2v2" />
    </BaseIcon>
  );
}

export function IconResources(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
      <path d="M4 12l8 3.5 8-3.5" />
      <path d="M4 16.5 12 20l8-3.5" />
    </BaseIcon>
  );
}

export function IconAgents(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="9" cy="9" r="2.25" />
      <circle cx="16" cy="11" r="1.75" />
      <path d="M5.5 18c.6-2.8 2.5-4.5 5.5-4.5s4.9 1.7 5.5 4.5" />
      <path d="M14.5 18c.3-1.4 1.2-2.2 2.9-2.2 1.1 0 1.9.3 2.6 1" />
    </BaseIcon>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9.5 9a2.75 2.75 0 1 1 4.75 1.86c-.8.72-1.75 1.12-1.75 2.39" />
      <path d="M12 16.5h.01" />
      <circle cx="12" cy="12" r="8.5" />
    </BaseIcon>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="m19.4 15-.9 1.6-1.8-.3a7.8 7.8 0 0 1-1.2 1.2l.3 1.8-1.6.9-1.2-1.4a7.5 7.5 0 0 1-1.8 0L9 20.2l-1.6-.9.3-1.8a7.8 7.8 0 0 1-1.2-1.2l-1.8.3-.9-1.6 1.4-1.2a7.5 7.5 0 0 1 0-1.8L4.1 10 5 8.4l1.8.3a7.8 7.8 0 0 1 1.2-1.2L7.7 5.7l1.6-.9 1.2 1.4a7.5 7.5 0 0 1 1.8 0L13.5 4.8l1.6.9-.3 1.8c.45.36.85.76 1.2 1.2l1.8-.3.9 1.6-1.4 1.2c.05.3.07.6.07.9s-.02.6-.07.9l1.4 1.2Z" />
    </BaseIcon>
  );
}

export function IconManager(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 10h10" />
      <path d="M9 10V8.5a3 3 0 1 1 6 0V10" />
      <path d="M6 10v7h12v-7" />
      <path d="M10.5 13.5h3" />
    </BaseIcon>
  );
}

export function IconAdmin(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3 4.5 6v4.5c0 4.8 3 8.8 7.5 10.5 4.5-1.7 7.5-5.7 7.5-10.5V6L12 3Z" />
      <path d="M9 12.5 11 14.5 15.5 10" />
    </BaseIcon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

export function IconImport(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 20h14" />
    </BaseIcon>
  );
}

export function IconHelpCircle(props: IconProps) {
  return <IconHelp {...props} />;
}

export function IconMenu(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </BaseIcon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </BaseIcon>
  );
}
