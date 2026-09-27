"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PdfPagesProps = {
  file: string | File;
  renderOverlay?: (pageNumber: number) => ReactNode;
  onPageClick?: (pageNumber: number, x: number, y: number) => void;
};

export default function PdfPages({
  file,
  renderOverlay,
  onPageClick,
}: PdfPagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(680);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setPageWidth(Math.max(300, Math.min(900, entry.contentRect.width - 56)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pdf-pages-scroll" ref={scrollRef}>
      <Document
        file={file}
        suspense={false}
        onLoadSuccess={({ numPages }) => {
          setPageCount(numPages);
          setError(false);
        }}
        onLoadError={() => setError(true)}
        loading={<p className="pdf-viewer-message">Chargement du document…</p>}
        error={
          <p className="pdf-viewer-message">Impossible d’afficher ce PDF.</p>
        }
        noData={<p className="pdf-viewer-message">Aucun document PDF.</p>}
      >
        {error
          ? null
          : Array.from({ length: pageCount }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <div
                  className="pdf-page-canvas"
                  key={pageNumber}
                  onClick={(event) => {
                    if (!onPageClick) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    onPageClick(
                      pageNumber,
                      ((event.clientX - bounds.left) / bounds.width) * 100,
                      ((event.clientY - bounds.top) / bounds.height) * 100,
                    );
                  }}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                  {renderOverlay?.(pageNumber)}
                </div>
              );
            })}
      </Document>
    </div>
  );
}
