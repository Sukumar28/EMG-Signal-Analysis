import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

type PlotlyTrace = Record<string, unknown>;

interface PlotlyChartProps {
  data: PlotlyTrace[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  height?: number;
  className?: string;
}

export default function PlotlyChart({
  data,
  layout = {},
  config = {},
  height = 340,
  className = '',
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const mergedLayout: Partial<Plotly.Layout> = {
      autosize: true,
      height,
      margin: { t: 28, r: 20, b: 46, l: 56 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      font: {
        family: 'DM Sans, -apple-system, sans-serif',
        size: 12,
        color: '#334155',
      },
      hoverlabel: {
        bgcolor: '#0f2544',
        bordercolor: '#0f2544',
        font: {
          family: 'IBM Plex Mono, monospace',
          size: 11,
          color: '#ffffff',
        },
      },
      xaxis: {
        gridcolor: '#f1f5f9',
        zerolinecolor: '#cbd5e1',
        linecolor: '#e2e8f0',
        tickfont: { family: 'IBM Plex Mono, monospace', size: 11, color: '#64748b' },
        ...(layout.xaxis ?? {}),
      },
      yaxis: {
        gridcolor: '#f1f5f9',
        zerolinecolor: '#cbd5e1',
        linecolor: '#e2e8f0',
        tickfont: { family: 'IBM Plex Mono, monospace', size: 11, color: '#64748b' },
        ...(layout.yaxis ?? {}),
      },
      ...layout,
    };

    const mergedConfig: Partial<Plotly.Config> = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
      ...config,
    };

    Plotly.react(el, data as Plotly.Data[], mergedLayout, mergedConfig);

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        Plotly.Plots.resize(containerRef.current);
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [data, layout, config, height]);

  useEffect(() => {
    const el = containerRef.current;
    return () => {
      if (el) {
        Plotly.purge(el);
      }
    };
  }, []);

  return <div ref={containerRef} className={`w-full ${className}`} style={{ minHeight: height }} />;
}
