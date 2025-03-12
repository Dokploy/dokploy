import React, { useEffect } from "react";

import Router from "next/router";

import NProgress from "nprogress";

interface LoadingBarProps {
  color?: string;
  startPosition?: number;
  stopDelayMs?: number;
  options?: object;
  height?: number;
}

export const LoadingBar: React.FC<LoadingBarProps> = ({
  color = "hsl(var(--primary))",
  startPosition = 0.3,
  stopDelayMs = 0,
  height = 5,
  options,
}) => {
  let timer: NodeJS.Timeout | null = null;

  const routeChangeStart = () => {
    NProgress.set(startPosition);
    NProgress.start();
  };

  const routeChangeEnd = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      NProgress.done(true);
    }, stopDelayMs);
  };

  useEffect(() => {
    if (options) {
      NProgress.configure(options);
    }
    Router.events.on("routeChangeStart", routeChangeStart);
    Router.events.on("routeChangeComplete", routeChangeEnd);
    Router.events.on("routeChangeError", routeChangeEnd);

    return () => {
      Router.events.off("routeChangeStart", routeChangeStart);
      Router.events.off("routeChangeComplete", routeChangeEnd);
      Router.events.off("routeChangeError", routeChangeEnd);
    };
  });

  return (
    <style>{`
      #nprogress {
        pointer-events: none;
      }
      #nprogress .bar {
        background: ${color};
        position: fixed;
        z-index: 1031;
        top: 0;
        left: 0;
        width: 100%;
        height: ${height}px;
      }
      #nprogress .peg {
        display: block;
        position: absolute;
        right: 0px;
        width: 100px;
        height: 100%;
        box-shadow:
          0 0 10px ${color},
          0 0 5px ${color};
        opacity: 1;
        -webkit-transform: rotate(3deg) translate(0px, -4px);
        -ms-transform: rotate(3deg) translate(0px, -4px);
        transform: rotate(3deg) translate(0px, -4px);
      }

      .nprogress-custom-parent {
        overflow: hidden;
        position: relative;
      }
      .nprogress-custom-parent #nprogress .spinner,
      .nprogress-custom-parent #nprogress .bar {
        position: absolute;
      }
      @-webkit-keyframes nprogress-spinner {
        0% {
          -webkit-transform: rotate(0deg);
        }
        100% {
          -webkit-transform: rotate(360deg);
        }
      }
      @keyframes nprogress-spinner {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
    `}</style>
  );
};
