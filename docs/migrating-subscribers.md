# Move the mailing list off Jetpack

Shows you how to move Adam's email subscribers from Jetpack to a new provider
without losing anybody, and how to prove afterwards that nobody was lost.

The plan behind this, including which provider and why, is in
[issue #1](https://github.com/0xharkirat/adamcogan.com/issues/1).

> [!IMPORTANT]
> Take the export before anything else happens to the WordPress site.
> Posts, images and comments can all be fetched again from WordPress at any time.
> The subscriber list cannot.
> Once WordPress.com stops hosting the site, the list goes with it, and there is no second copy.

## Prerequisites

- You have the WordPress.com login that owns adamcogan.com.
- You have Node.js 22.22.0 or later, which `.nvmrc` pins.
- You have decided which provider receives the list.
- You have somewhere private to keep 2 CSV files while you work.

## Export the list from Jetpack

1. Sign in to `cloud.jetpack.com` as the owner of adamcogan.com.
2. Select the site, then open **Subscribers**.
3. Click the 3 dot menu beside **Add Subscribers**.
4. Choose **Download subscribers as CSV**.
5. Note the subscriber count the dashboard shows, before you leave the page.
   You need it to check the export is complete.

The file is personal data belonging to Adam's readers rather than to us.
Keep it off shared drives, out of chat messages, and out of this repository.

## Check the export

Run the file through the checker:

```bash
node migration/scripts/7-subscribers.mjs check ~/Downloads/subscribers.csv
```

It reports which column holds the addresses, how many rows it read, and how many
of them are safe to import.
It writes `migration/raw/subscribers-import.csv` containing only the addresses
that should be mailed.

The script refuses to write anywhere git would track, because this repository is
public. If you point it somewhere else, it stops rather than writing.

### What it holds back, and why

| Held back | Reason |
| --- | --- |
| Unsubscribed, bounced or complained | Mailing them again breaks the promise they were given, and it is the fastest route to a blocked sending domain |
| Pending or unconfirmed | They never finished signing up, so there is no consent to carry over |
| Malformed addresses | They would bounce and damage the sending reputation of a brand new list |
| Duplicates, compared case-insensitively | The same person would receive every email twice |
| An unrecognised status | Deliberately excluded rather than guessed. Read these before deciding |

Compare `rows read` against the count you noted in step 5.
A gap means the export itself was truncated, so take it again before continuing.

## Import into the new provider

1. Create the list, and set it to accept already-confirmed subscribers.
2. Import `migration/raw/subscribers-import.csv`.
3. Confirm that no opt-in or confirmation email is sent to the imported addresses.
   This is the step that quietly destroys a migrated list.
   People who signed up years ago mostly will not re-confirm, and there is no way back once the mail has gone.
4. Export the list straight back out of the provider.

## Verify

Reconcile what you sent against what arrived:

```bash
node migration/scripts/7-subscribers.mjs reconcile migration/raw/subscribers-import.csv ~/Downloads/provider-export.csv
```

- It exits 0 and says every subscriber made it across.
- Extra addresses at the provider are fine, and mean somebody signed up after the export.
- Anything missing exits 1 and reports the affected domains rather than the addresses.

Send 1 test campaign to your own address before sending anything real.
Check that the email renders, that the unsubscribe link works, and that a post link resolves.

## Clean up

1. Delete the Jetpack export.
2. Delete `migration/raw/subscribers-import.csv`.
3. Delete the provider export.

Keep the WordPress install alive until the first real campaign has gone out from
the new provider. It is the only way back if the import turns out to be wrong.

## Troubleshooting

### The checker cannot find an email column

It prints the headers it saw. Jetpack has changed these before. Either the export
is empty, or the column is named something the pattern misses, in which case
widen `findEmailColumn` in `migration/scripts/7-subscribers.mjs`.

### Many rows come back as an unrecognised status

The script excludes anything it cannot positively identify as active, which is
the safe direction. Read the values, and if they are genuinely active
subscribers, add the pattern to `classifyStatus` and run the check again.

### Reconcile reports missing subscribers, all on one domain

The provider rejected that domain rather than the import truncating.
Ask them why before re-importing.

### Reconcile reports missing subscribers spread across many domains

The import stopped early. Providers often cap rows per import.
Split the file and import it in parts, then reconcile again.
