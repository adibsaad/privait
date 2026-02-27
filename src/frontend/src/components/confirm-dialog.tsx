import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@frontend/components/ui/alert-dialog'

export function ConfirmDialog({
  title = 'Are you sure?',
  description,

  onConfirm,
  onDismiss = () => {},

  children,
}: {
  title?: string
  description?: string

  onConfirm: () => void
  onDismiss?: () => void

  children: React.ReactNode
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="flex sm:justify-between">
          <AlertDialogCancel onClick={() => onDismiss()}>No</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm()}>Yes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
