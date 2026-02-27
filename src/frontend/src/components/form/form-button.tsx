export const FormButton = ({
  value,
  type = 'submit',
  disabled = false,
  onClick,
}: {
  value: string
  type?: 'submit' | 'button'
  disabled?: boolean
  onClick?: () => void
}) => {
  return (
    <input
      onClick={onClick}
      disabled={disabled}
      value={value}
      type={type}
      className="bg-primary border-primary disabled:bg-gray-3 disabled:border-gray-3 disabled:text-dark-5 inline-flex items-center justify-center rounded-md border px-7 py-3 text-center text-base font-medium text-white hover:border-[#1B44C8] hover:bg-[#1B44C8] active:border-[#1B44C8] active:bg-[#1B44C8]"
    />
  )
}
