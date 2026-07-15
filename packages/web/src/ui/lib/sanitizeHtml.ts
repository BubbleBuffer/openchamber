import DOMPurify from 'dompurify';

/**
 * Sanitize an HTML string for injection via React's `dangerouslySetInnerHTML`.
 * Use for output from third-party renderers (syntax highlighters, etc.) that
 * may inadvertently include attacker-controlled markup.
 */
export function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html);
}

/**
 * Sanitize an SVG string (e.g. from Mermaid) for injection via
 * `dangerouslySetInnerHTML`. Allows the SVG profile so diagram markup
 * survives, while stripping `<script>`, event handlers, and other vectors.
 */
export function sanitizeSvg(svg: string): string {
    return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}
