import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'

import { gql } from '@apollo/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'

import { CenteredSpinner } from '@frontend/components/centered-spinner'
import { InputField } from '@frontend/components/form/input-field'
import { Button } from '@frontend/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@frontend/components/ui/card'
import { Form } from '@frontend/components/ui/form'
import { useMagicLinkMutation } from '@frontend/graphql/generated'
import { v } from '@frontend/helpers'

import { useCurrentUser } from '../hooks/current-user'

gql(`
  mutation MagicLink($email: String!) {
    magicLink(email: $email) {
      __typename

      ... on Error {
        message
      }

      ... on MutationMagicLinkSuccess {
        data
      }
    }
  }
`)

const formSchema = z.object({
  email: z.string().email(),
})

type FormValues = z.infer<typeof formSchema>
export const Login = () => {
  const { currentUser, isLoading } = useCurrentUser()
  const [magicLinkMut] = useMagicLinkMutation()

  const magicLinkSubmit = (values: FormValues) => {
    magicLinkMut({
      variables: {
        email: values.email,
      },
    })
      .then(res => {
        if (res.data?.magicLink?.__typename === 'Error') {
          toast.error(res.data.magicLink.message)
        } else if (
          res.data?.magicLink?.__typename === 'MutationMagicLinkSuccess'
        ) {
          form.reset()
          toast.success('Check your email for the magic link')
        }
      })
      .catch(err => console.log(err))
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  })

  if (!currentUser && isLoading) {
    return <CenteredSpinner />
  }

  if (currentUser) {
    return <Navigate to="/" />
  }

  return (
    <div className="mt-20 flex items-center justify-center">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email below to login with magic link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <Form {...form}>
              <form onSubmit={v(form.handleSubmit(magicLinkSubmit))}>
                <div className="grid gap-2">
                  <InputField
                    control={form.control}
                    label="Email"
                    name="email"
                  />
                </div>
                <Button type="submit" className="mt-4 w-full">
                  Login with Magic Link
                </Button>
              </form>
            </Form>
            {/* <div className="flex items-center justify-center">
              <div className="h-px w-1/4 bg-gray-300"></div>
              <div className="mx-2 text-gray-500">OR</div>
              <div className="h-px w-1/4 bg-gray-300"></div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => ssoLogin()}
            >
              <FaLock className="mr-2 h-5 w-5" />
              Log in with SSO
            </Button> */}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
