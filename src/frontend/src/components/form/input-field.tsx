import { ComponentProps } from 'react'
import { Control, FieldPath, FieldValues } from 'react-hook-form'

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form'
import { Input } from '../ui/input'

export function InputField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  control,
  label,
  inputArgs,
}: {
  control: Control<TFieldValues>
  name: TName
  label: string
  inputArgs?: ComponentProps<'input'>
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="w-full">
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Input autoComplete="off" {...field} {...inputArgs} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
