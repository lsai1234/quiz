export function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
        <div className="absolute inset-0 rounded-full border-2 border-t-orange-500 animate-spin" />
      </div>
      {message && <p className="text-sm text-zinc-400 text-center max-w-xs">{message}</p>}
    </div>
  )
}
