import { cn } from '@/lib/utils'

/**
 * Logo del producto CRM ISWO (pedido de dirección, 23/11/2026).
 * Negro en el tema claro y blanco en el oscuro: el original es negro sobre blanco.
 */
export function CrmIswoLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/brand/crm-iswo-logo-dark.png"
        alt="CRM ISWO"
        className={cn('w-auto object-contain dark:hidden', className)}
        loading="eager"
        decoding="async"
      />
      <img
        src="/brand/crm-iswo-logo-white.png"
        alt="CRM ISWO"
        className={cn('hidden w-auto object-contain dark:block', className)}
        loading="eager"
        decoding="async"
      />
    </>
  )
}
