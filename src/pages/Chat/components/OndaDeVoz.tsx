export function OndaDeVoz({ niveis }: { niveis: number[] }) {
  return (
    <div aria-hidden className="flex h-8 w-full items-center gap-[3px] overflow-hidden">
      {niveis.map((nivel, indice) => (
        <span
          key={indice}
          className="w-[3px] shrink-0 rounded-full bg-primary transition-[height] duration-100 ease-out"
          style={{ height: `${Math.max(10, nivel * 100)}%` }}
        />
      ))}
    </div>
  )
}
