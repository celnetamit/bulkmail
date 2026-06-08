# AWS SES + SNS Setup Guide for MailFlow

This guide walks you from the very first AWS login all the way to a working Amazon SES + Amazon SNS setup for MailFlow.

Use this if you are setting the app up from scratch and want a checklist you can follow without guessing.

## What You Need Before You Start

- An AWS account with permission to create SES and SNS resources
- Access to your DNS provider if you are verifying a domain
- A public HTTPS URL for the app, or a tunnel/public host if you are testing locally
- Access to the MailFlow environment file, usually `.env.local`

## Important App Note

MailFlow sends email with Amazon SES using the AWS SDK.

For bounce and complaint tracking to work reliably, SES must publish events to SNS. The easiest way to do that with the current app is to set the SES configuration set as the default for your verified identity in AWS.

If you do not do that, SES may send email successfully but MailFlow may never receive bounce or complaint events.

## Step 1. Sign In to AWS

1. Open the AWS Console and sign in with the AWS account you want to use.
2. Pick one AWS region and keep it consistent for everything in this setup.
3. The region you choose here must match the `AWS_REGION` value in MailFlow later.

Recommended example:

- `ap-south-1`

Do not mix regions. SES identities, SES configuration sets, SNS topics, and sending permissions are all region-specific.

## Step 2. Open Amazon SES

1. In the AWS Console, search for `SES`.
2. Open **Amazon Simple Email Service**.
3. Make sure you are still in the same region you chose in Step 1.
4. If your account is still in the SES sandbox, note that you can only send to verified recipients or the SES mailbox simulator until you get production access.

## Step 3. Request SES Production Access

If you want to send to real recipients, move SES out of the sandbox first.

1. In SES, find the section for **Account dashboard** or **Sending limits**.
2. Look for the sandbox status.
3. If it says sandbox, request production access.
4. Fill in the business and use-case details AWS asks for.
5. Wait for AWS to approve the request.

Why this matters:

- Sandbox accounts are restricted
- Sandbox accounts are not appropriate for real bulk campaigns
- You need production access for normal sending

Official docs:

- [Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

## Step 4. Verify Your SES Sending Identity

You must verify the address or domain MailFlow will use as the sender.

Recommended approach:

- Verify a domain identity, not just a single email address
- Enable DKIM
- Use a real sending subdomain if possible, for example `mail.example.com`

### If You Are Verifying a Domain

1. In SES, open **Verified identities**.
2. Choose **Create identity**.
3. Select **Domain**.
4. Enter your domain, for example `example.com` or `mail.example.com`.
5. Enable DKIM if offered.
6. Create the identity.
7. SES will show DNS records that need to be added at your DNS provider.
8. Copy those records exactly into your DNS zone.
9. Wait until SES shows the identity as **Verified**.

### If You Are Verifying a Single Email Address

1. In SES, open **Verified identities**.
2. Choose **Create identity**.
3. Select **Email address**.
4. Enter the sender address you will use in MailFlow.
5. Confirm the verification email SES sends you.
6. Wait until SES shows the identity as **Verified**.

Official docs:

- [Verified identities in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html)
- [Create and verify a domain identity](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/verify-domain-procedure.html)

## Step 5. Create an SNS Topic

1. In the AWS Console, search for `SNS`.
2. Open **Amazon Simple Notification Service**.
3. Make sure you are still in the same region.
4. Choose **Topics**.
5. Choose **Create topic**.
6. Select **Standard**.
7. Give the topic a clear name, for example:

```text
mailflow-ses-events
```

8. Create the topic.

You will use this topic for SES bounce and complaint notifications.

Official docs:

- [Create an SNS topic](https://docs.aws.amazon.com/sns/latest/dg/sns-create-topic.html)

## Step 6. Create a SES Configuration Set

1. Return to **Amazon SES**.
2. Open **Configuration sets**.
3. Choose **Create set**.
4. Give the configuration set a name, for example:

```text
mailflow-events
```

5. Create the set.

Why this matters:

- SES configuration sets let you publish delivery events to other AWS services
- MailFlow needs this to receive bounce and complaint data

Official docs:

- [Create configuration sets in SES](https://docs.aws.amazon.com/ses/latest/dg/creating-configuration-sets.html)
- [Using configuration sets in SES](https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html)

## Step 7. Add an SNS Event Destination to the SES Configuration Set

1. Open the configuration set you just created.
2. Go to the **Event destinations** section or tab.
3. Choose **Add destination** or the equivalent button in the console.
4. Select **Amazon SNS** as the destination type.
5. Pick the SNS topic you created in Step 5.
6. Enable the event types you want MailFlow to receive.

Recommended event types:

- `BOUNCE`
- `COMPLAINT`
- `DELIVERY`
- `SEND`

Optional if you want extra visibility:

- `REJECT`
- `OPEN`
- `CLICK`

7. Save the destination.

Important:

- If SES is not using this configuration set when sending, SNS will not receive the events.

Official docs:

- [SES SNS event destination](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/event-publishing-add-event-destination-sns.html)

## Step 8. Make the Configuration Set the Default for the Identity

This is the easiest way to make the current MailFlow app work without code changes.

1. Go back to **Verified identities** in SES.
2. Open the identity you verified in Step 4.
3. Edit the identity settings.
4. Find the option for **Default configuration set**.
5. Select the configuration set you created in Step 6.
6. Save the changes.

Why this is important:

- The current MailFlow SES send path does not explicitly pass a configuration set name
- Setting a default configuration set at the identity level ensures SES still publishes bounce and complaint events

Official docs:

- [Managing identities in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/managing-identities.html)
- [Using configuration sets with identities](https://docs.aws.amazon.com/ses/latest/dg/managing-configuration-sets-default-overriding.html)

## Step 9. Subscribe the MailFlow Webhook to SNS

1. Open the SNS topic you created in Step 5.
2. Choose **Create subscription**.
3. Set the protocol to **HTTPS**.
4. Set the endpoint to your MailFlow webhook:

```text
https://your-public-domain/api/webhooks/aws-ses
```

5. Create the subscription.
6. SNS will send a subscription confirmation request to your webhook.
7. MailFlow automatically confirms the SNS subscription when it receives the confirmation message.

If you are testing locally:

- You must expose MailFlow on a public HTTPS URL
- AWS SNS will not confirm a private localhost URL

Official docs:

- [Subscribe an HTTPS endpoint to SNS](https://docs.aws.amazon.com/sns/latest/dg/sns-subscribe-https-s-endpoints-to-topic.html)
- [SNS subscription confirmation JSON format](https://docs.aws.amazon.com/sns/latest/dg/http-subscription-confirmation-json.html)

## Step 10. Configure MailFlow Environment Variables

Open `.env.local` and set the AWS values.

Minimum values for SES:

```env
MAIL_PROVIDER=aws-ses
AWS_REGION=ap-south-1
AWS_SES_FROM_EMAIL=no-reply@example.com
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

Optional values:

```env
AWS_SESSION_TOKEN=only-if-you-use-temporary-credentials
APP_URL=https://your-public-domain
WEBHOOK_SHARED_SECRET=some-shared-secret
AWS_SNS_TOPIC_ARN_ALLOWLIST=arn:aws:sns:ap-south-1:123456789012:mailflow-ses-events
```

Notes:

- `AWS_REGION` must match the region where you created SES and SNS resources
- `AWS_SES_FROM_EMAIL` must be in the verified identity
- `WEBHOOK_SHARED_SECRET` is optional for SNS, but useful for other webhook traffic
- If you set `AWS_SNS_TOPIC_ARN_ALLOWLIST`, the SNS topic ARN must match exactly

## Step 11. Restart MailFlow

After changing `.env.local`:

1. Stop the dev server if it is running.
2. Restart the app so the new values are loaded.
3. Confirm the app can still log in and load the dashboard.

## Step 12. Confirm the SES Send Path

Before testing bounces, make sure sending itself works.

1. Open MailFlow settings.
2. Confirm the provider is set to **AWS SES**.
3. Confirm the sender email is correct.
4. Send a test email to a real inbox you control.
5. Confirm the mail arrives.

If the send fails:

- Check the SES identity verification status
- Check that SES is out of the sandbox
- Check that the AWS credentials are valid
- Check that the region matches
- Check that the sender email is allowed by the verified identity

## Step 13. Test Bounce and Complaint Tracking

Use the SES mailbox simulator first.

Recommended simulator addresses:

- `bounce@simulator.amazonses.com`
- `complaint@simulator.amazonses.com`
- `success@simulator.amazonses.com`

Test flow:

1. Send a test campaign or test email to the simulator address.
2. Wait a short time for SES and SNS to process the event.
3. Check MailFlow campaign analytics.
4. Check whether the corresponding contact/event is marked as bounced or delivered.

Why this helps:

- The simulator is the safest way to confirm the SES -> SNS -> MailFlow chain
- It avoids wasting real recipient addresses while you are still testing

Official docs:

- [Sending test emails with the SES mailbox simulator](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html)

## Step 14. Test a Real Non-Existing Address

After the simulator works, test one real invalid mailbox.

1. Add one address you know does not exist.
2. Send a small test campaign.
3. Wait for the provider to generate a bounce.
4. Confirm SES publishes the bounce event to SNS.
5. Confirm MailFlow receives the SNS notification.
6. Confirm the contact becomes `BOUNCED` in MailFlow.

Important:

- MailFlow does not detect a non-existing mailbox at send time
- SES usually learns about that after the message is handed off to the recipient mail server
- That is why the webhook step is required

## Step 15. Verify in MailFlow

Check these places in the app:

1. **Campaigns** page
2. **Analytics** page
3. **Contacts** page
4. **Admin** or **Settings** pages if you have permission

You want to see:

- Sent counts increasing
- Bounce counts increasing when the provider sends bounce events
- Contact statuses updating to `BOUNCED`
- Webhook-related errors staying absent

## Step 16. Common Problems and Fixes

### Problem: Email sends, but MailFlow shows no bounces

Likely causes:

- SES configuration set is not attached as the default on the verified identity
- SNS topic is not subscribed to the MailFlow webhook
- SNS subscription is not confirmed
- MailFlow webhook URL is not public HTTPS
- `AWS_SNS_TOPIC_ARN_ALLOWLIST` blocks the topic

### Problem: SES says sandbox

Fix:

- Request production access

### Problem: MailFlow says the webhook signature is invalid

Fix:

- If the request is coming from SNS, confirm the SNS topic and subscription
- If the request is not SNS, check `WEBHOOK_SHARED_SECRET`
- Make sure you did not point the subscription to the wrong URL

### Problem: SES send fails immediately

Fix:

- Verify the sender identity again
- Check the AWS credentials
- Check the region
- Make sure `MAIL_PROVIDER=aws-ses`

## Step 17. Final Checklist

Before you say the setup is complete, confirm all of these are true:

- [ ] AWS region chosen and consistent everywhere
- [ ] SES is out of sandbox, or you are only using simulator addresses
- [ ] SES sending identity is verified
- [ ] DNS records for the identity are published
- [ ] SES configuration set exists
- [ ] SNS topic exists
- [ ] SES event destination points to the SNS topic
- [ ] Default configuration set is attached to the verified SES identity
- [ ] SNS HTTPS subscription points to `/api/webhooks/aws-ses`
- [ ] SNS subscription is confirmed
- [ ] `.env.local` has `MAIL_PROVIDER=aws-ses`
- [ ] `.env.local` has the correct `AWS_REGION`
- [ ] `.env.local` has the correct sender email and AWS credentials
- [ ] MailFlow was restarted after environment changes
- [ ] SES test email works
- [ ] Bounce test works
- [ ] MailFlow records the bounce and updates the contact status

## Shortcut Summary

If you only remember one thing:

1. Verify SES identity
2. Create SNS topic
3. Create SES configuration set
4. Add SNS event destination
5. Set the configuration set as default on the identity
6. Subscribe MailFlow webhook to SNS
7. Set `MAIL_PROVIDER=aws-ses` and the region/credentials in `.env.local`
8. Test with the SES simulator
9. Test one real invalid address

If you want, I can also turn this into a shorter copy-paste setup checklist or add screenshots/console labels for each click path.
