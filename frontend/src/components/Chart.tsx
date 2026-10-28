import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { Analysis } from '../services/api'
import { getChartTheme } from '../styles/chartTheme'
import { useTheme } from '../styles/theme'
import { ukDate, ukTime, number } from '../lib/format'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, SVGRenderer])

export default function Chart({ data, kind = 'generation' }: {
  data: Analysis; kind?: 'generation' | 'accuracy' | 'bias'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { resolved } = useTheme()
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' })
    const theme = getChartTheme()
    const generation = kind === 'generation'
    const labels = generation
      ? data.points.map(point => `${ukDate(point.start_time)}, ${ukTime(point.start_time)}`)
      : data.daily.map(day => ukDate(`${day.label}T12:00:00Z`))
    const baseLine = { type: 'line' as const, showSymbol: false, connectNulls: false, smooth: false,
      emphasis: { focus: 'series' as const }, lineStyle: { width: 2 }, animation: false }
    chart.setOption({
      animation: false,
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: theme.text },
      grid: { left: 64, right: 20, top: 22, bottom: generation && data.points.length > 48 ? 65 : 40 },
      tooltip: {
        trigger: 'axis', renderMode: 'richText',
        backgroundColor: theme.surface, borderColor: theme.border,
        textStyle: { color: theme.heading }, valueFormatter: (value: unknown) =>
          typeof value === 'number' ? `${number(value)} MW` : 'Unavailable',
      },
      xAxis: { type: 'category', data: labels, boundaryGap: kind === 'bias',
        axisLine: { lineStyle: { color: theme.border } }, axisTick: { show: false },
        axisLabel: { color: theme.text, fontSize: 11, hideOverlap: true,
          formatter: (value: string) => generation && data.points.length <= 48 ? value.split(', ')[1] : value.split(', ')[0] },
      },
      yAxis: { type: 'value', name: 'MW', nameTextStyle: { color: theme.text, align: 'right' },
        axisLabel: { color: theme.text, fontSize: 11, formatter: (value: number) => number(value) },
        splitLine: { lineStyle: { color: theme.border, type: 'dashed' } },
      },
      ...(generation && data.points.length > 48 ? { dataZoom: [{ type: 'inside' }, {
        type: 'slider', height: 18, bottom: 7, borderColor: theme.border,
        fillerColor: theme.primarySubtle, textStyle: { color: theme.text },
        dataBackground: { lineStyle: { color: theme.border }, areaStyle: { color: theme.border } },
        selectedDataBackground: { lineStyle: { color: theme.forecast }, areaStyle: { color: theme.primarySubtle } },
      }] } : {}),
      series: generation ? [
        { ...baseLine, name: 'Day-ahead forecast', data: data.points.map(p => p.forecast_mw), itemStyle: { color: theme.forecast } },
        { ...baseLine, name: 'Actual generation', data: data.points.map(p => p.actual_mw), itemStyle: { color: theme.actual }, lineStyle: { width: 2, type: 'dashed' } },
      ] : kind === 'accuracy' ? [
        { ...baseLine, showSymbol: true, symbolSize: 5, name: 'MAE', data: data.daily.map(d => d.metrics.mae_mw), itemStyle: { color: theme.forecast } },
        { ...baseLine, showSymbol: true, symbolSize: 5, name: 'RMSE', data: data.daily.map(d => d.metrics.rmse_mw), itemStyle: { color: theme.actual }, lineStyle: { width: 2, type: 'dashed' } },
      ] : [{ type: 'bar', name: 'Signed bias', barMaxWidth: 22,
        data: data.daily.map(d => d.metrics.bias_mw == null ? null : ({
          value: d.metrics.bias_mw,
          itemStyle: { color: d.metrics.bias_mw >= 0 ? theme.error : theme.actual, borderRadius: [3, 3, 0, 0] },
        })),
      }],
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => { observer.disconnect(); chart.dispose() }
  }, [data, kind, resolved])
  return <div className="chart" ref={ref} role="img"
    aria-label={kind === 'generation' ? 'Wind forecast and actual generation in megawatts. Values are available in the data table.'
      : kind === 'accuracy' ? 'Daily mean absolute error and root mean square error in megawatts.' : 'Daily signed forecast bias in megawatts.'} />
}
