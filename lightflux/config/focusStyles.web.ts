import { DESKTOP_LAYOUT_BREAKPOINT } from './layout';

const STYLE_ID = 'lightflux-focus-styles';
const WEB_MIN_WIDTH = 320;
const WEB_MIN_HEIGHT = 568;

if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html,
    body {
      margin: 0;
      min-height: ${WEB_MIN_HEIGHT}px;
      min-width: ${WEB_MIN_WIDTH}px;
      overflow: auto;
    }

    #root {
      display: flex;
      min-height: max(100vh, ${WEB_MIN_HEIGHT}px);
      min-width: ${WEB_MIN_WIDTH}px;
    }

    #root > div {
      flex: 1 0 auto;
      min-height: ${WEB_MIN_HEIGHT}px;
      min-width: ${WEB_MIN_WIDTH}px;
    }

    input:focus,
    textarea:focus,
    [contenteditable="true"]:focus {
      outline: none !important;
    }

    #task-title-input:focus {
      border-bottom-color: #6759e8 !important;
      box-shadow: 0 2px 0 rgba(103, 89, 232, 0.16);
    }

    /* The task body is an inline document-style editor: the whole surface is
       editable, so it never shows a textarea-like focus border or ring. */
    #task-rich-editor,
    #task-rich-editor:focus-within {
      border-color: transparent !important;
      box-shadow: none !important;
    }

    @media (max-width: ${DESKTOP_LAYOUT_BREAKPOINT - 1}px) {
      html,
      body,
      #root,
      #root > div {
        height: 100%;
        min-height: 0;
      }

      html,
      body {
        overflow-x: auto;
        overflow-y: hidden;
      }

      #root {
        overflow: hidden;
      }

      @supports (height: 100dvh) {
        html,
        body,
        #root,
        #root > div {
          height: 100dvh;
        }
      }
    }

    #today-task-composer:focus-within,
    #calendar-task-composer:focus-within,
    #project-name-composer:focus-within,
    #context-subtask-composer:focus-within,
    [data-testid='lf-composer']:focus-within {
      border-color: rgba(103, 89, 232, 0.56) !important;
      box-shadow: 0 0 0 3px rgba(103, 89, 232, 0.09);
    }

    button:focus {
      outline: none;
    }

    button:focus-visible,
    [role="button"]:focus-visible,
    [role="checkbox"]:focus-visible,
    [role="tab"]:focus-visible {
      outline: 2px solid rgba(103, 89, 232, 0.72) !important;
      outline-offset: 2px;
    }

    input,
    textarea,
    [contenteditable="true"],
    button,
    [role="button"],
    [role="checkbox"],
    [role="tab"] {
      transition:
        border-color 140ms ease,
        box-shadow 140ms ease,
        outline-color 140ms ease,
        background-color 140ms ease;
    }

    /* Project completion bars: deterministic transform driven by React, with
       a CSS spring on web/Tauri (RN Animated is not driven in Hermes web). */
    [data-testid='lf-progress-fill'] {
      transform-origin: left center;
      transition: transform 480ms cubic-bezier(0.24, 1, 0.32, 1);
      will-change: transform;
    }
    [data-testid='lf-progress-shimmer'] {
      /* "both" keeps the element invisible during the 160ms delay (0% keyframe),
         otherwise a fully-opaque band flashes before the sweep starts. */
      animation: lf-progress-shimmer 900ms cubic-bezier(0.4, 0, 0.2, 1) 160ms
        1 normal both;
      opacity: 0;
    }
    @keyframes lf-progress-shimmer {
      0% {
        opacity: 0;
        transform: translateX(-120%);
      }
      25%,
      75% {
        opacity: 0.85;
      }
      100% {
        opacity: 0;
        transform: translateX(420%);
      }
    }

    /* Entrance motion for adding tasks and projects. One-shot keyframes on
       mount only (new DOM nodes); native drives the equivalent via
       LayoutAnimation in the projects controller. */
    [data-testid='lf-composer'] {
      animation: lf-composer-in 190ms cubic-bezier(0.22, 1, 0.36, 1) both;
      transform-origin: top center;
    }
    [data-testid='lf-row-in'] {
      animation: lf-row-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    [data-testid='lf-card-in'] {
      animation: lf-card-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes lf-composer-in {
      0% {
        opacity: 0;
        transform: translateY(-5px) scaleY(0.85);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scaleY(1);
      }
    }
    @keyframes lf-row-in {
      0% {
        opacity: 0;
        transform: translateY(-7px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes lf-card-in {
      0% {
        opacity: 0;
        transform: translateY(12px) scale(0.98);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      [data-testid='lf-progress-fill'] {
        transition: none;
      }
      [data-testid='lf-progress-shimmer'] {
        animation: none;
      }
      [data-testid='lf-composer'],
      [data-testid='lf-row-in'],
      [data-testid='lf-card-in'] {
        animation: none;
      }
    }
  `;
  document.head.appendChild(style);
}

export {};
