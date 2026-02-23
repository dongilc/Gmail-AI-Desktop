import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

// PDF.js 워커 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfViewerProps {
  data: string; // base64 encoded PDF data
}

export function PdfViewer({ data }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF 로드
  useEffect(() => {
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        // URL-safe base64를 일반 base64로 변환
        let base64Data = data.replace(/-/g, '+').replace(/_/g, '/');

        // 패딩 추가
        while (base64Data.length % 4) {
          base64Data += '=';
        }

        // base64를 Uint8Array로 변환
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        });
        const pdfDoc = await loadingTask.promise;

        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error('PDF 로드 실패:', err);
        setError(`PDF를 로드할 수 없습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      } finally {
        setLoading(false);
      }
    };

    if (data) {
      loadPdf();
    }
  }, [data]);

  // 페이지 렌더링
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    const renderPage = async () => {
      if (!pdf || !canvasRef.current) return;

      // 이전 렌더링 취소
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      try {
        const page = await pdf.getPage(currentPage);
        const dpr = window.devicePixelRatio || 1;
        const cssViewport = page.getViewport({ scale });
        const renderViewport = page.getViewport({ scale: scale * dpr });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        // HiDPI: 물리 픽셀 크기로 캔버스 설정, CSS는 논리적 크기
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: context,
          viewport: renderViewport,
          canvas,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        renderTaskRef.current = null;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('페이지 렌더링 실패:', err);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdf, currentPage, scale]);

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const zoomIn = () => {
    setScale((s) => Math.min(s + 0.2, 3));
  };

  const zoomOut = () => {
    setScale((s) => Math.max(s - 0.2, 0.5));
  };

  // 폭에 맞춤
  const fitToWidth = useCallback(async () => {
    if (!pdf || !containerRef.current) return;

    try {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current.clientWidth - 32; // padding 제외
      const newScale = containerWidth / viewport.width;
      setScale(Math.min(Math.max(newScale, 0.5), 3));
    } catch (err) {
      console.error('폭에 맞춤 실패:', err);
    }
  }, [pdf, currentPage]);

  // 한페이지에 맞춤
  const fitToPage = useCallback(async () => {
    if (!pdf || !containerRef.current) return;

    try {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current.clientWidth - 32;
      const containerHeight = containerRef.current.clientHeight - 32;

      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const newScale = Math.min(scaleX, scaleY);
      setScale(Math.min(Math.max(newScale, 0.5), 3));
    } catch (err) {
      console.error('한페이지에 맞춤 실패:', err);
    }
  }, [pdf, currentPage]);

  // Ctrl+마우스휠 줌
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        setScale((s) => Math.min(s + 0.1, 3));
      } else {
        setScale((s) => Math.max(s - 0.1, 0.5));
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-muted-foreground">PDF 로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 컨트롤 바 */}
      <div className="flex items-center justify-center gap-4 p-2 border-b bg-muted/30">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextPage}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-2" />
        <Button variant="ghost" size="icon" onClick={zoomOut} title="축소">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" onClick={zoomIn} title="확대">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-2" />
        <Button variant="ghost" size="icon" onClick={fitToWidth} title="폭에 맞춤">
          <Maximize className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={fitToPage} title="한페이지에 맞춤">
          <Square className="h-4 w-4" />
        </Button>
      </div>

      {/* PDF 캔버스 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-200 p-4"
        onWheel={handleWheel}
      >
        <div className="min-w-full flex justify-center">
          <canvas
            key={`${currentPage}-${scale}`}
            ref={canvasRef}
            className="shadow-lg bg-white"
          />
        </div>
      </div>
    </div>
  );
}
