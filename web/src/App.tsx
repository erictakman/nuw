import { SubnetCalculator } from "@/components/subnet-calculator"

export function App() {
  return (
    <div className="flex min-h-svh justify-center p-4 sm:p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <SubnetCalculator />
        <p className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </p>
      </div>
    </div>
  )
}

export default App
