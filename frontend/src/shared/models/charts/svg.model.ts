export interface PlotArea {
  width: number
  height: number
  padLeft?: number
  padRight?: number
  padTop?: number
  padBottom?: number
}

export interface Scale {
  x: (index: number) => number
  y: (value: number) => number
  area: Required<PlotArea>
}
