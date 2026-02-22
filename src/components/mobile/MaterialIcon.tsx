export default function MaterialIcon({
  name,
  className = "",
  filled = false,
}: {
  name: string
  className?: string
  filled?: boolean
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 600, 'opsz' 24`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}