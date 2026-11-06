# Product and subscriptions

## Experience

Melt is a paid creative studio in which a person, their external AI agent and,
eventually, their team work on the same editable composition. Classic and Studio
remain presentations of the same document and capabilities. Headless uses the
same authoring and rendering behavior.

The application provides the creative tools, catalogs and execution environment.
An external agent normally supplies its own model access. Included model
generation or hosted render capacity would need an explicit allowance rather
than an implicit unlimited entitlement.

## Access and trial

- An email account is required for the trial and paid cloud projects.
- There is no permanent free application tier in this direction.
- Three days is the trial duration discussed so far; confirm before implementation.
- Trial feature restrictions and storage/render allowances need a concrete table.
- Email verification, account recovery and abuse prevention need an implementation.
- A payment card requirement was not decided.
- EUR 8/month is a working price, not a validated margin or final published offer.
- Individual versus workspace billing, tax treatment and a Teams offer remain open.

The trial should let a person understand the intended creative workflow, including
the agent connection if MCP is a central product promise. Exact restrictions must
be explicit in the interface and enforced by the API, not only by hidden buttons.

## Project and resource allowances

The accepted direction is no fixed count limit for paid cloud projects. The
earlier 1,000-project proposal is superseded. This does not promise unlimited
bytes, processing, exports, retained history or request concurrency.

An entitlement should distinguish:

| Dimension         | Product policy to define                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| Projects          | No fixed count cap; paginated listing and bounded active documents.              |
| Storage           | Included bytes per billing owner, with optional additional storage.              |
| Uploads           | File size, image dimensions/pixel count, video duration/resolution/codec limits. |
| History           | Included version retention and its contribution to storage usage.                |
| MCP               | Request bursts, concurrent operations and separately metered expensive jobs.     |
| Hosted processing | Render/inference duration, output size and concurrency.                          |
| Collaboration     | Seats, participants per room and active-room allowances.                         |

All numeric limits remain to be selected using real workloads. Do not publish
"unlimited storage" or inherit a provider's free tier as a customer entitlement.
Storage shared by a team should be charged to a clearly identified billing owner.

## Media admission and the asset bank

Reject an unsupported upload before expensive decoding or cloud processing when
its declared size permits an early decision; verify actual decoded properties too.
Report the specific limit and retain the current project when an import fails.

Offer useful actions: choose a smaller file, trim/compress/resize through an
explicit workflow, choose an asset from Melt's video/image bank, or change the
storage/processing allowance where offered. An asset-bank recommendation must
offer relevant content rather than merely block the user's artwork.

Bank assets need stable identifiers, preview derivatives, actual format/duration
metadata, allowed-use information and a defined accounting policy. Reusing a bank
asset should not require copying its original into every project. Availability,
licensing, caching and export behavior must remain predictable.

## Subscription lifecycle

Define trial expiration, renewal, cancellation, failed payment and over-quota
behavior before launch. Specify read/export access and any grace period; these
policies are not settled by the current discussion. Do not implement immediate
data deletion or silent storage overage charges as a default assumption.

Deletion, version pruning and account closure must update byte accounting and
respect shared references. Existing portable import/export remains a migration
and exit mechanism; cloud delivery does not require inventing a second file format.
