import { DataSourceToggle } from '@/components/portal/DataSourceToggle'

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Settings</h1>
      <p className="text-sm text-[var(--color-muted)] mb-5">Choose where the app reads its catalogue from.</p>
      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Data source</h2>
      <DataSourceToggle />
    </div>
  )
}
