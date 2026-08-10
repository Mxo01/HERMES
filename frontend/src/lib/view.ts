export type View = 'live' | 'history' | 'alarms'

export const MOBILE_VIEWS: View[] = ['live', 'history', 'alarms']

/** Alarms live inside the live view on desktop, where there is room for the table. */
export const DESKTOP_VIEWS: View[] = ['live', 'history']
