/**
 * The measured width of an element, for a drawing that must fit its container.
 *
 * The chart is plain SVG at real pixel coordinates rather than a scaled
 * `viewBox`, because a scaled drawing scales its text too: a chart that is
 * comfortable on a laptop becomes unreadable four-point type on a phone. The
 * container is measured instead, so labels keep their size and the plot keeps
 * the width it actually has — which is also what keeps a wide chart from
 * pushing the page sideways.
 *
 * `ResizeObserver` is absent in the jsdom environment the unit tests run in, so
 * its absence is a supported case and falls back to the initial width rather
 * than throwing.
 */

import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Track an element's content width.
 *
 * @param ref The element to measure.
 * @param fallback The width to assume before, or without, a measurement.
 * @returns The current width in CSS pixels.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const measure = () => {
      const measured = element.clientWidth;
      if (measured > 0) {
        setWidth(measured);
      }
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return width;
}
