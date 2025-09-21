(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-EDITION-LIMIT (err u101))
(define-constant ERR-INVALID-TITLE (err u102))
(define-constant ERR-INVALID-DESCRIPTION (err u103))
(define-constant ERR-INVALID-FILE-HASH (err u104))
(define-constant ERR-MAX-EDITION-REACHED (err u105))
(define-constant ERR-NO-NFT (err u106))
(define-constant ERR-NOT-OWNER (err u107))
(define-constant ERR-INVALID-TOKEN-ID (err u108))
(define-constant ERR-METADATA-FROZEN (err u109))
(define-constant ERR-INVALID-ROYALTY-RATE (err u110))
(define-constant ERR-INVALID-ROYALTY-RECIPIENT (err u111))
(define-constant ERR-ALREADY-BURNED (err u112))
(define-constant ERR-INVALID-BURN (err u113))
(define-constant ERR-INVALID-UPDATE (err u114))
(define-constant ERR-MAX-TOKENS-EXCEEDED (err u115))
(define-constant ERR-INVALID-MINT-FEE (err u116))
(define-constant ERR-AUTHORITY-NOT-SET (err u117))
(define-constant ERR-INVALID-AUTHORITY (err u118))
(define-constant ERR-INVALID-STATUS (err u119))
(define-constant ERR-INVALID-TIMESTAMP (err u120))

(define-non-fungible-token music-nft uint)

(define-map nft-metadata
  { token-id: uint }
  {
    creator: principal,
    title: (string-ascii 100),
    description: (string-ascii 256),
    file-hash: (buff 32),
    edition-limit: uint,
    edition-count: uint,
    timestamp: uint,
    royalty-rate: uint,
    royalty-recipient: principal,
    status: bool,
    frozen: bool
  }
)

(define-map nft-royalty-history
  { token-id: uint }
  { rate: uint, recipient: principal, update-timestamp: uint }
)

(define-data-var last-token-id uint u0)
(define-data-var max-tokens uint u10000)
(define-data-var mint-fee uint u500)
(define-data-var authority-principal (optional principal) none)

(define-read-only (get-nft-metadata (token-id uint))
  (map-get? nft-metadata { token-id: token-id })
)

(define-read-only (get-nft-royalty-history (token-id uint))
  (map-get? nft-royalty-history { token-id: token-id })
)

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? music-nft token-id))
)

(define-read-only (verify-ownership (token-id uint) (owner principal))
  (match (nft-get-owner? music-nft token-id)
    current-owner (ok (is-eq current-owner owner))
    (ok false)
  )
)

(define-read-only (is-metadata-frozen (token-id uint))
  (match (map-get? nft-metadata { token-id: token-id })
    meta (ok (get frozen meta))
    (ok false)
  )
)

(define-private (validate-title (title (string-ascii 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
    (ok true)
    ERR-INVALID-TITLE)
)

(define-private (validate-description (desc (string-ascii 256)))
  (if (<= (len desc) u256)
    (ok true)
    ERR-INVALID-DESCRIPTION)
)

(define-private (validate-file-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    ERR-INVALID-FILE-HASH)
)

(define-private (validate-edition-limit (limit uint))
  (if (and (> limit u0) (<= limit u1000))
    (ok true)
    ERR-INVALID-EDITION-LIMIT)
)

(define-private (validate-royalty-rate (rate uint))
  (if (<= rate u20)
    (ok true)
    ERR-INVALID-ROYALTY-RATE)
)

(define-private (validate-royalty-recipient (recipient principal))
  (if (not (is-eq recipient tx-sender))
    (ok true)
    ERR-INVALID-ROYALTY-RECIPIENT)
)

(define-private (validate-token-id (id uint))
  (if (< id (var-get last-token-id))
    (ok true)
    ERR-INVALID-TOKEN-ID)
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    ERR-INVALID-TIMESTAMP)
)

(define-private (validate-authority (p principal))
  (if (is-eq (some p) (var-get authority-principal))
    (ok true)
    ERR-INVALID-AUTHORITY)
)

(define-public (set-authority (new-authority principal))
  (begin
    (asserts! (is-none (var-get authority-principal)) ERR-AUTHORITY-NOT-SET)
    (var-set authority-principal (some new-authority))
    (ok true)
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (try! (validate-authority tx-sender))
    (asserts! (> new-fee u0) ERR-INVALID-MINT-FEE)
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-tokens (new-max uint))
  (begin
    (try! (validate-authority tx-sender))
    (asserts! (> new-max (var-get last-token-id)) ERR-INVALID_UPDATE)
    (var-set max-tokens new-max)
    (ok true)
  )
)

(define-public (mint-nft (title (string-ascii 100)) (description (string-ascii 256)) (file-hash (buff 32)) (edition-limit uint) (royalty-rate uint) (royalty-recipient principal))
  (let
    (
      (new-id (+ (var-get last-token-id) u1))
      (authority (var-get authority-principal))
    )
    (asserts! (< (var-get last-token-id) (var-get max-tokens)) ERR-MAX-TOKENS-EXCEEDED)
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-file-hash file-hash))
    (try! (validate-edition-limit edition-limit))
    (try! (validate-royalty-rate royalty-rate))
    (try! (validate-royalty-recipient royalty-recipient))
    (asserts! (is-some authority) ERR-AUTHORITY-NOT-SET)
    (try! (stx-transfer? (var-get mint-fee) tx-sender (unwrap! authority ERR-AUTHORITY-NOT-SET)))
    (try! (nft-mint? music-nft new-id tx-sender))
    (map-set nft-metadata { token-id: new-id }
      {
        creator: tx-sender,
        title: title,
        description: description,
        file-hash: file-hash,
        edition-limit: edition-limit,
        edition-count: u1,
        timestamp: block-height,
        royalty-rate: royalty-rate,
        royalty-recipient: royalty-recipient,
        status: true,
        frozen: false
      }
    )
    (map-set nft-royalty-history { token-id: new-id }
      { rate: royalty-rate, recipient: royalty-recipient, update-timestamp: block-height }
    )
    (var-set last-token-id new-id)
    (print { event: "nft-minted", id: new-id })
    (ok new-id)
  )
)

(define-public (transfer-nft (token-id uint) (recipient principal))
  (let
    (
      (owner (unwrap! (nft-get-owner? music-nft token-id) ERR-NO-NFT))
    )
    (try! (validate-token-id token-id))
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (try! (nft-transfer? music-nft token-id tx-sender recipient))
    (print { event: "nft-transferred", id: token-id, to: recipient })
    (ok true)
  )
)

(define-public (burn-nft (token-id uint))
  (let
    (
      (owner (unwrap! (nft-get-owner? music-nft token-id) ERR-NO-NFT))
      (meta (unwrap! (map-get? nft-metadata { token-id: token-id }) ERR-NO-NFT))
    )
    (try! (validate-token-id token-id))
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (get status meta) ERR-ALREADY-BURNED)
    (try! (nft-burn? music-nft token-id tx-sender))
    (map-set nft-metadata { token-id: token-id } (merge meta { status: false }))
    (print { event: "nft-burned", id: token-id })
    (ok true)
  )
)

(define-public (update-royalty (token-id uint) (new-rate uint) (new-recipient principal))
  (let
    (
      (meta (unwrap! (map-get? nft-metadata { token-id: token-id }) ERR-NO-NFT))
      (owner (unwrap! (nft-get-owner? music-nft token-id) ERR-NO-NFT))
    )
    (try! (validate-token-id token-id))
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (not (get frozen meta)) ERR-METADATA-FROZEN)
    (try! (validate-royalty-rate new-rate))
    (try! (validate-royalty-recipient new-recipient))
    (map-set nft-metadata { token-id: token-id } (merge meta { royalty-rate: new-rate, royalty-recipient: new-recipient }))
    (map-set nft-royalty-history { token-id: token-id } { rate: new-rate, recipient: new-recipient, update-timestamp: block-height })
    (print { event: "royalty-updated", id: token-id })
    (ok true)
  )
)

(define-public (freeze-metadata (token-id uint))
  (let
    (
      (meta (unwrap! (map-get? nft-metadata { token-id: token-id }) ERR-NO-NFT))
      (owner (unwrap! (nft-get-owner? music-nft token-id) ERR-NO-NFT))
    )
    (try! (validate-token-id token-id))
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (not (get frozen meta)) ERR-METADATA-FROZEN)
    (map-set nft-metadata { token-id: token-id } (merge meta { frozen: true }))
    (print { event: "metadata-frozen", id: token-id })
    (ok true)
  )
)

(define-public (mint-edition (token-id uint))
  (let
    (
      (meta (unwrap! (map-get? nft-metadata { token-id: token-id }) ERR-NO-NFT))
      (new-edition-id (+ (var-get last-token-id) u1))
      (current-count (get edition-count meta))
    )
    (try! (validate-token-id token-id))
    (asserts! (is-eq tx-sender (get creator meta)) ERR-NOT-AUTHORIZED)
    (asserts! (< current-count (get edition-limit meta)) ERR-MAX-EDITION-REACHED)
    (try! (nft-mint? music-nft new-edition-id tx-sender))
    (map-set nft-metadata { token-id: new-edition-id } meta)
    (map-set nft-metadata { token-id: token-id } (merge meta { edition-count: (+ current-count u1) }))
    (var-set last-token-id new-edition-id)
    (print { event: "edition-minted", original-id: token-id, new-id: new-edition-id })
    (ok new-edition-id)
  )
)