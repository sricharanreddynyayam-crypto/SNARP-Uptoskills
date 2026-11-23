import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Image as ImageIcon, X, UserPlus, Article, Star, ArrowUp, ArrowSquareOut, LinkSimple, PencilSimpleLine,
} from '@phosphor-icons/react'
import { api } from './api'
import { Avatar } from './components/ui'
import PostCard, { PostActions } from './components/PostCard'
import { ExpandableText } from './components/RichText'
import Stories from './components/Stories'
import PdfAttachment from './components/PdfAttachment'
import CardMenu from './components/CardMenu'
import LoginPrompt from './components/LoginPrompt'
import { useLoginPrompt } from './useLoginPrompt'
import { useViewTracker } from './views'
import { ROLE_LABEL, timeAgo } from './format'

const MAX = 5000
const MAX_IMAGE = 5 * 1024 * 1024
const MAX_TAGS = 5
const NEW_ITEMS_POLL_MS = 60000
const SCOPES = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'following', label: 'Following' },
]
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'post', label: 'Posts' },
  { key: 'paper', label: 'Papers' },
]

const itemKey = (item) => `${item.type === 'paper' ? 'paper' : 'post'}-${item.id}`
const isPost = (item) => item.type !== 'paper'
function unseenFeedItems(items, additions) {
  const known = new Set(items.map(itemKey))
  return additions.filter((item) => {
    const key = itemKey(item)
    if (known.has(key)) return false
    known.add(key)
    return true
  })
}

async function readFeedPage(page, scope, options) {
  const feed = await api(`/posts?page=${page}&scope=${scope}`, options)
  if (!Array.isArray(feed?.items) || feed.page !== page || typeof feed.hasMore !== 'boolean') {
    throw new Error('The server returned an invalid feed.')
  }
  return feed
}

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0]
const DISMISSED_KEY = 'snarp-dismissed-requests'
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 })
function readDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]').map(String) } catch { return [] }
}

function FeedPaper({ paper, viewer, onUpdate, onLogout }) {
  const authors = (paper.authors ?? []).map((author) => typeof author === 'string' ? author : author.name).filter(Boolean)
  const tags = paper.tags ?? []
  const shownTags = tags.slice(0, MAX_TAGS)
  const avatar = <Avatar name={paper.author_name} src={paper.author_avatar_url} size="md" />
  return (
    <li className="panel post feed-paper" id={`paper-${paper.id}`}>
      <header className="feed-card-head">
        {viewer ? <Link to={`/users/${paper.user_id}`} tabIndex={-1} aria-hidden="true">{avatar}</Link> : avatar}
        <div className="feed-card-who">
          <p>
            {viewer ? <Link to={`/users/${paper.user_id}`} className="feed-card-name">{paper.author_name}</Link> : <strong className="feed-card-name">{paper.author_name}</strong>}
            {' '}<span>published a research paper</span>
          </p>
          <time dateTime={paper.created_at} title={new Date(paper.created_at).toLocaleString()}>{timeAgo(paper.created_at)}</time>
        </div>
        <span className="feed-kind"><Article size={14} weight="bold" /> Paper</span>
        {viewer && <CardMenu label="Paper options" items={[
          { label: 'View details', icon: ArrowSquareOut, to: `/articles/${paper.id}` },
          { label: 'Copy link', icon: LinkSimple, onClick: () => navigator.clipboard?.writeText(`${location.origin}/articles/${paper.id}`).catch(() => {}) },
        ]} />}
      </header>
      <div className="feed-paper-box">
        {paper.domain && <span className="feed-paper-domain">{paper.domain}</span>}
        <h2 className="feed-paper-title">{viewer ? <Link to={`/articles/${paper.id}`}>{paper.title}</Link> : paper.title}</h2>
        {authors.length > 0 && <p className="feed-paper-authors">{authors.join(', ')}</p>}
        <ExpandableText className="feed-paper-abstract" text={paper.abstract} lines={3} />
        {tags.length > 0 && (
          <div className="tag-row">
            {shownTags.map((tag) => viewer
              ? <Link key={tag} className="tag tag-link" to={`/articles?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>
              : <span key={tag} className="tag">#{tag}</span>)}
            {viewer && tags.length > shownTags.length && <Link className="tag tag-link tag-more" to={`/articles/${paper.id}`}>+{tags.length - shownTags.length} more</Link>}
          </div>
        )}
        {viewer && <PdfAttachment paperId={paper.id} filename={paper.pdf_filename} size={paper.pdf_size} title={paper.title} />}
      </div>
      <PostActions post={paper} kind="paper" viewerId={viewer?.id} canModerate={['admin', 'moderator'].includes(viewer?.role)} onUpdate={onUpdate} onLogout={onLogout} />
    </li>
  )
}

// Paper of the Day (PR #23): today's featured published paper and earlier picks.
function PaperOfTheDay() {
  const [today, setToday] = useState(undefined)
  const [past, setPast] = useState([])
  useEffect(() => {
    let active = true
    api('/papers/featured').then((paper) => { if (active) setToday(paper) }).catch(() => { if (active) setToday(null) })
    api('/papers/past-picks').then((list) => { if (active) setPast(list.slice(0, 5)) }).catch(() => {})
    return () => { active = false }
  }, [])
  if (today === undefined) return null
  const authors = (today?.authors ?? []).map((author) => (typeof author === 'string' ? author : author.name)).filter(Boolean)
  return (
    <section className="rail-sec potd" aria-labelledby="rail-potd">
      <h3 id="rail-potd" className="rail-title"><Star size={16} weight="fill" className="potd-star" /> Paper of the Day</h3>
      {today ? (
        <Link to={`/articles/${today.id}`} className="potd-card">
          {today.domain && <span className="potd-domain">{today.domain}</span>}
          <strong>{today.title}</strong>
          {authors.length > 0 && <small>{authors.slice(0, 3).join(', ')}{authors.length > 3 ? ' et al.' : ''}</small>}
          <p>{today.abstract}</p>
          <span className="potd-stats">{today.like_count} likes · {today.save_count} saves</span>
        </Link>
      ) : <p className="rail-empty">No published papers to feature yet.</p>}
      {past.length > 0 && (
        <>
          <h4 className="potd-past-title">Past picks</h4>
          <ul className="potd-past">
            {past.map((paper) => (
              <li key={paper.id}>
                <Link to={`/articles/${paper.id}`}>{paper.title}</Link>
                <time dateTime={paper.featured_date}>{new Date(`${String(paper.featured_date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function FollowRow({ person, onFollow }) {
  return (
    <div className="rail-row follow-row">
      <Link to={`/users/${person.id}`} className="follow-person">
        <Avatar name={person.name} src={person.avatar_url} size="md" />
        <span>
          <strong>{person.name}</strong>
          <small>{person.institution || (person.shared_interests > 0
            ? `${person.shared_interests} shared ${person.shared_interests === 1 ? 'interest' : 'interests'}`
            : ROLE_LABEL[person.role])}</small>
        </span>
      </Link>
      <button className="follow-add" onClick={() => onFollow(person)} aria-label={`Follow ${person.name}`} title="Follow">
        <UserPlus size={22} weight="fill" />
      </button>
    </div>
  )
}

function Composer({ me, onPosted, onError }) {
  const [body, setBody] = useState('')
  const [image, setImage] = useState(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)
  const textRef = useRef(null)
  const imageUrl = image?.url

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }, [body])

  const clearImage = () => {
    setImage(null)
  }

  const attachFile = (file) => {
    if (!file || posting) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file (JPEG, PNG, GIF or WebP)')
    if (file.size > MAX_IMAGE) return setError('Image must be 5 MB or smaller')
    setError('')
    clearImage()
    setImage({ file, url: URL.createObjectURL(file) })
  }

  const submit = async (event) => {
    event?.preventDefault()
    if ((!body.trim() && !image) || posting) return
    setPosting(true)
    setError('')
    try {
      const form = new FormData()
      form.append('body', body)
      if (image) form.append('image', image.file)
      const post = await api('/posts', { method: 'POST', body: form })
      onPosted({ ...post, type: 'post' })
      setBody('')
      clearImage()
    } catch (err) {
      if (err.status === 401) onError(err)
      else setError(err.message)
    } finally {
      setPosting(false)
    }
  }

  const remaining = MAX - body.length
  return (
    <form
      className={`composer panel ${dragging ? 'composer-dragging' : ''}`}
      onSubmit={submit}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); attachFile(event.dataTransfer.files[0]) }}
    >
      <Avatar name={me.name} src={me.avatar_url} />
      <div className="composer-main">
        <label htmlFor="post-body" className="sr-only">Write a post</label>
        <textarea
          id="post-body"
          ref={textRef}
          rows={2}
          maxLength={MAX}
          placeholder={`What are you working on, ${firstName(me.name)}?`}
          value={body}
          disabled={posting}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && (event.ctrlKey || event.metaKey) && submit()}
          onPaste={(event) => {
            const file = [...event.clipboardData.files].find((item) => item.type.startsWith('image/'))
            if (file) { event.preventDefault(); attachFile(file) }
          }}
        />
        {image && (
          <div className="composer-preview">
            <img src={image.url} alt="Selected upload preview" />
            <button type="button" className="icon-btn preview-remove" onClick={clearImage} disabled={posting} aria-label="Remove image">
              <X size={16} />
            </button>
          </div>
        )}
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="composer-foot">
          <div className="composer-tools">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={(event) => { attachFile(event.target.files[0]); event.target.value = '' }} />
            <button type="button" className="tool-btn" onClick={() => fileRef.current.click()} disabled={posting} title="Add a photo (you can also paste or drop one)">
              <ImageIcon size={16} /> Photo
            </button>
          </div>
          {remaining <= 500 && (
            <span className={`count ${remaining <= 200 ? 'count-warn' : ''}`} aria-live="polite">{remaining} left</span>
          )}
          <span className="composer-hint">Ctrl + Enter to post</span>
          <button type="submit" className="btn btn-primary btn-sm" disabled={posting || (!body.trim() && !image)}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
      {dragging && <div className="composer-drop" aria-hidden="true">Drop the image to attach it</div>}
    </form>
  )
}

export default function Feed({ user, onLogout }) {
  const userId = user?.id
  const authenticated = userId != null
  const { requireAuth, promptProps } = useLoginPrompt(authenticated)
  const [me, setMe] = useState(user)
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [scope, setScope] = useState('everyone')
  const [suggestions, setSuggestions] = useState([])
  const [followers, setFollowers] = useState([])
  const [dismissed, setDismissed] = useState(readDismissed)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [incoming, setIncoming] = useState([])
  const sentinelRef = useRef(null)
  const feedRef = useRef(null)
  const itemsRef = useRef(items)
  const logoutRef = useRef(onLogout)
  useEffect(() => {
    itemsRef.current = items
    logoutRef.current = onLogout
  })

  const handleError = useCallback((err, showError = setLoadError) => {
    if (authenticated && err.status === 401 && logoutRef.current) logoutRef.current()
    else showError(authenticated ? err.message : 'Could not load the public feed. Please try again.')
  }, [authenticated])

  useEffect(() => {
    if (!authenticated) return undefined
    const controller = new AbortController()
    const load = (path, apply) => api(path, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) apply(result) })
      .catch((err) => { if (!controller.signal.aborted && err.status === 401) handleError(err) })
    load('/auth/me', setMe)
    load('/users/suggestions', setSuggestions)
    load(`/users/${userId}/followers`, setFollowers)
    return () => controller.abort()
  }, [authenticated, handleError, userId])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const stream = { controller, scope, page: 1, hasMore: false, loadingMore: false }
    feedRef.current = stream
    readFeedPage(1, scope, { authenticated, signal })
      .then((feed) => {
        if (signal.aborted) return
        stream.hasMore = feed.hasMore
        setItems(unseenFeedItems([], feed.items))
        setHasMore(feed.hasMore)
        setIncoming([])
      })
      .catch((err) => { if (!signal.aborted) handleError(err) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
    return () => {
      controller.abort()
      if (feedRef.current === stream) feedRef.current = null
    }
  }, [authenticated, scope, handleError, retryCount])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const stream = feedRef.current
    let checking = false
    const check = async () => {
      if (document.hidden || loading || loadError || checking) return
      checking = true
      try {
        const feed = await readFeedPage(1, scope, { authenticated, signal })
        if (signal.aborted || stream?.controller.signal.aborted || feedRef.current !== stream) return
        const current = itemsRef.current
        const known = new Set(current.map(itemKey))
        const newest = current[0] ? new Date(current[0].created_at) : new Date(0)
        setIncoming(feed.items.filter((item) => !known.has(itemKey(item)) && new Date(item.created_at) > newest))
      } catch (err) {
        if (authenticated && err.status === 401 && !signal.aborted && feedRef.current === stream && !stream?.controller.signal.aborted) handleError(err)
      } finally { checking = false }
    }
    const timer = setInterval(check, NEW_ITEMS_POLL_MS)
    return () => { controller.abort(); clearInterval(timer) }
  }, [authenticated, scope, loading, loadError, handleError])

  const showIncoming = () => {
    setItems((current) => [...unseenFeedItems(current, incoming), ...current])
    setIncoming([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadMore = useCallback(async () => {
    const feed = feedRef.current
    if (!feed || !feed.hasMore || feed.loadingMore || feed.controller.signal.aborted) return
    const { signal } = feed.controller
    feed.loadingMore = true
    setLoadingMore(true)
    setLoadError('')
    try {
      const next = await readFeedPage(feed.page + 1, feed.scope, { authenticated, signal })
      if (signal.aborted) return
      feed.page = next.page
      feed.hasMore = next.hasMore
      setItems((current) => [...current, ...unseenFeedItems(current, next.items)])
      setHasMore(next.hasMore)
    } catch (err) {
      if (!signal.aborted) handleError(err)
    } finally {
      feed.loadingMore = false
      if (!signal.aborted) setLoadingMore(false)
    }
  }, [authenticated, handleError])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loadingMore || loadError) return undefined
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadError, loadMore])

  const resetFeed = () => {
    feedRef.current?.controller.abort()
    setItems([])
    setLoadError('')
    setLoading(true)
    setLoadingMore(false)
    setHasMore(false)
    setIncoming([])
  }

  const retryFeed = () => {
    resetFeed()
    setRetryCount((count) => count + 1)
  }

  const changeScope = (next) => {
    if (next === scope) return
    resetFeed()
    setScope(next)
  }

  const follow = async (person) => {
    setActionError('')
    try {
      await api(`/users/${person.id}/follow`, { method: 'PUT', body: { following: true } })
      setSuggestions((current) => current.filter((item) => item.id !== person.id))
      setFollowers((current) => current.map((item) => item.id === person.id ? { ...item, followed_by_me: true } : item))
      setMe((current) => ({ ...current, following_count: (current.following_count ?? 0) + 1 }))
      if (feedRef.current?.scope === 'following') retryFeed()
    } catch (err) {
      if (feedRef.current) handleError(err, setActionError)
    }
  }

  const onPosted = (post) => {
    setItems((current) => [post, ...unseenFeedItems([post], current)])
    setMe((current) => ({ ...current, post_count: (current.post_count ?? 0) + 1 }))
  }
  const updatePost = (updated) => setItems((current) => current.map((item) => isPost(item) && String(item.id) === String(updated.id) ? { ...item, ...updated } : item))
  const updatePaper = (updated) => setItems((current) => current.map((item) => !isPost(item) && String(item.id) === String(updated.id) ? { ...item, ...updated } : item))
  const removePost = (id) => {
    setItems((current) => current.filter((item) => !(isPost(item) && String(item.id) === String(id))))
    setMe((current) => ({ ...current, post_count: Math.max(0, (current.post_count ?? 1) - 1) }))
  }

  const decline = (person) => {
    const next = [...new Set([...dismissed, String(person.id)])]
    setDismissed(next)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-200))) } catch {}
  }

  const shown = items.filter((item) => filter === 'all' || (filter === 'paper' ? !isPost(item) : isPost(item)))
  const stackRef = useRef(null)
  useViewTracker(stackRef, shown.map(itemKey).join(), authenticated)
  const requests = followers.filter((person) => !person.followed_by_me && !dismissed.includes(String(person.id)))

  return (
    <div className="feed-layout">
      <main className="feed">
        <h1 className="sr-only">Feed</h1>
        {me && <Stories me={me} />}
        {me && <Composer me={me} onPosted={onPosted} onError={handleError} />}

        <div className="feed-bar">
          <h2>Feeds</h2>
          <div className="feed-kinds" role="group" aria-label="Show">
            {FILTERS.map((item) => (
              <button key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}</button>
            ))}
          </div>
          {authenticated && <div className="feed-toggle" role="group" aria-label="Whose updates to show">
            {SCOPES.map((item) => (
              <button key={item.key} aria-pressed={scope === item.key} className={scope === item.key ? 'active' : ''} onClick={() => changeScope(item.key)}>{item.label}</button>
            ))}
          </div>}
        </div>

        {incoming.length > 0 && (
          <button className="feed-incoming" onClick={showIncoming}>
            <ArrowUp size={14} /> {incoming.length} new {incoming.length === 1 ? 'update' : 'updates'}
          </button>
        )}

        {loadError && <p className="alert" role="alert">{loadError}</p>}
        {actionError && <p className="alert" role="alert">{actionError}</p>}
        {loadError && !hasMore && <button type="button" className="btn btn-ghost btn-sm" onClick={retryFeed}>Retry feed</button>}

        {loading ? (
          <div className="post-stack" aria-busy="true" aria-label="Loading posts">
            {[0, 1, 2].map((i) => (
              <div key={i} className="post">
                <div className="avatar skeleton" />
                <div className="post-main">
                  <div className="skeleton skeleton-line" style={{ width: '30%' }} />
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line" style={{ width: '70%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 && hasMore ? (
          !loadError && <p className="feed-end" role="status">{loadingMore ? 'Checking the next page…' : 'No matches on the loaded pages. More feed items are available.'}</p>
        ) : shown.length === 0 ? (
          !loadError && (
            <div className="panel empty feed-empty">
              <span className="feed-empty-icon" aria-hidden="true">{scope === 'following' ? <UserPlus size={22} /> : filter === 'paper' ? <Article size={22} /> : <PencilSimpleLine size={22} />}</span>
              <h3>{scope === 'following' ? 'Nothing from people you follow yet' : filter === 'paper' ? 'No approved papers yet' : 'No posts yet'}</h3>
              <p>{scope === 'following'
                ? 'Follow researchers to see their posts and papers here. Your own posts appear here too.'
                : filter === 'paper' ? 'Papers appear here once a moderator approves them.' : authenticated ? 'Be the first to share an update with the SNARP community.' : 'Public updates will appear here.'}</p>
              {scope === 'following' && suggestions.length > 0 && (
                <div className="empty-suggestions">
                  {suggestions.map((person) => <FollowRow key={person.id} person={person} onFollow={follow} />)}
                </div>
              )}
            </div>
          )
        ) : (
          <ul className="post-stack" ref={stackRef}>
            {shown.map((item) => item.type === 'paper'
              ? <FeedPaper key={itemKey(item)} paper={item} viewer={me} onUpdate={updatePaper} onLogout={onLogout} />
              : <PostCard key={itemKey(item)} post={item} viewerId={me?.id} viewerRole={me?.role} onUpdate={updatePost} onRemove={removePost} onLogout={onLogout} requireAuth={requireAuth} />)}
          </ul>
        )}

        {!loading && hasMore && (
          <div ref={sentinelRef} className="feed-more">
            <button className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : loadError ? 'Retry loading more' : 'Load more'}</button>
          </div>
        )}
        {!loading && !hasMore && shown.length > 0 && <p className="feed-end">You're all caught up</p>}
        <LoginPrompt {...promptProps} />
      </main>

      {me && <aside className="rail">
        <PaperOfTheDay />
        <section className="rail-sec" aria-labelledby="rail-requests">
          <h3 id="rail-requests" className="rail-title">Requests {requests.length > 0 && <span className="rail-count">{requests.length}</span>}</h3>
          {requests.length === 0 && <p className="rail-empty">No new requests. When someone follows you, you can accept them as a contact here.</p>}
          {requests.slice(0, 3).map((person) => (
            <div key={person.id} className="request">
              <Link to={`/users/${person.id}`} tabIndex={-1} aria-hidden="true">
                <Avatar name={person.name} src={person.avatar_url} size="lg" />
              </Link>
              <div>
                <p><Link to={`/users/${person.id}`} className="request-name">{person.name}</Link> wants to add you as a contact</p>
                <div className="request-actions">
                  <button type="button" className="request-accept" onClick={() => follow(person)}>Accept</button>
                  <button type="button" className="request-decline" onClick={() => decline(person)}>Decline</button>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="rail-sec" aria-labelledby="rail-suggest">
          <h3 id="rail-suggest" className="rail-title">Suggestion for you</h3>
          {suggestions.map((person) => <FollowRow key={person.id} person={person} onFollow={follow} />)}
          {suggestions.length === 0 && <p className="rail-empty">No new suggestions right now.</p>}
        </section>

        <section className="rail-sec">
          <Link to={`/users/${me.id}`} className="follower-card">
            {followers.length > 0 && (
              <span className="follower-stack" aria-hidden="true">
                {followers.slice(0, 10).map((person) => <Avatar key={person.id} name={person.name} src={person.avatar_url} size="sm" />)}
              </span>
            )}
            <span className="follower-count"><strong>{compact.format(me.follower_count ?? followers.length)}</strong> Follower</span>
            <span className="follower-note">{followers.length > 0 ? 'Following your research on SNARP' : 'Share a post or paper to get your first follower'}</span>
          </Link>
        </section>
      </aside>}
    </div>
  )
}
