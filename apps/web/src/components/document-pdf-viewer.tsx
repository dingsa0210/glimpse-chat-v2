"use client";

import { useEffect, useRef, useState } from "react";

type PdfDocument = Awaited<ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>["promise"]>;

function PdfPage({ document, pageNumber, zoom, rotation }: { document: PdfDocument; pageNumber: number; zoom: number; rotation: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [height, setHeight] = useState(900);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: "900px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;
    void document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: Math.max(0.25, zoom) * 0.55, rotation });
      const maxCanvasPixels = 14_000_000;
      const pixelRatio = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(maxCanvasPixels / Math.max(1, viewport.width * viewport.height))));
      const canvas = canvasRef.current;
      delete canvas.dataset.rendered;
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setHeight(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
      return renderTask.promise.then(() => { if (!cancelled) canvas.dataset.rendered = "true"; });
    }).catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") console.error(error);
    });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [document, pageNumber, rotation, visible, zoom]);

  return <div ref={hostRef} className="mx-auto w-fit min-w-48 overflow-hidden bg-white shadow" style={{ minHeight: height }}><canvas ref={canvasRef} className="block" /></div>;
}

type DocumentPdfViewerProps = {
  url: string;
  fileName: string;
  zoom: number;
  rotation: number;
  onZoomChange: (zoom: number) => void;
  scrollProgress?: number;
  onScrollProgressChange?: (progress: number) => void;
};

export function DocumentPdfViewer({ url, fileName, zoom, rotation, onZoomChange, scrollProgress, onScrollProgressChange }: DocumentPdfViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const applyingScrollRef = useRef(false);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy(): Promise<void> } | null = null;
    void import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const task = pdfjs.getDocument({ url, withCredentials: true });
      loadingTask = task;
      return task.promise;
    }).then((loaded) => { if (!cancelled) setDocument(loaded); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; void loadingTask?.destroy(); };
  }, [url]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoomChange(Math.min(4, Math.max(0.25, Number((zoom + (event.deltaY < 0 ? 0.15 : -0.15)).toFixed(2)))));
    };
    host.addEventListener("wheel", wheel, { passive: false });
    return () => host.removeEventListener("wheel", wheel);
  }, [onZoomChange, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || scrollProgress === undefined) return;
    let frame = 0;
    const applyScrollProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scrollRange = Math.max(0, host.scrollHeight - host.clientHeight);
        const nextScrollTop = Math.min(1, Math.max(0, scrollProgress)) * scrollRange;
        if (Math.abs(host.scrollTop - nextScrollTop) <= 1) return;
        applyingScrollRef.current = true;
        host.scrollTop = nextScrollTop;
        requestAnimationFrame(() => { applyingScrollRef.current = false; });
      });
    };
    applyScrollProgress();
    const content = host.firstElementChild;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(applyScrollProgress);
    observer?.observe(host);
    if (content instanceof HTMLElement) observer?.observe(content);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [document, rotation, scrollProgress, zoom]);

  function reportScrollProgress() {
    if (applyingScrollRef.current || !onScrollProgressChange) return;
    const host = hostRef.current;
    if (!host) return;
    const scrollRange = Math.max(0, host.scrollHeight - host.clientHeight);
    const nextProgress = scrollRange > 0 ? host.scrollTop / scrollRange : 0;
    if (scrollProgress !== undefined && Math.abs(nextProgress - scrollProgress) < 0.001) return;
    onScrollProgressChange(nextProgress);
  }

  return <div ref={hostRef} className="h-full overflow-auto rounded bg-slate-200 p-3" aria-label={`${fileName} PDF preview`} data-pdf-scroll-progress={scrollProgress?.toFixed(4)} onScroll={reportScrollProgress}>
    {error ? <div className="grid h-full place-items-center"><p className="max-w-lg rounded border border-coral/30 bg-white p-4 text-sm text-coral">PDF preview failed: {error}</p></div> : null}
    {!error && !document ? <div className="grid h-full place-items-center text-sm text-slate-500">Loading PDF…</div> : null}
    {document ? <div className="space-y-4">{Array.from({ length: document.numPages }, (_, index) => <PdfPage key={index + 1} document={document} pageNumber={index + 1} zoom={zoom} rotation={rotation} />)}</div> : null}
  </div>;
}
