import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const storeUrl = "https://zapstore.dev/apps/org.dergigi.ants";
const releasesUrl = "https://github.com/dergigi/ants-android/releases/latest";
const description =
  "Advanced Nostr search, native on Android. Find notes, discover people, explore media, and follow your curiosity. No account required.";

export const metadata: Metadata = {
  title: "ants for Android — Nostr in your pocket",
  description,
  alternates: { canonical: "/android" },
  openGraph: {
    title: "ants for Android",
    description,
    url: "/android",
    images: ["/android-chrome-512x512.png"],
  },
  twitter: {
    card: "summary",
    title: "ants for Android",
    description,
    images: ["/android-chrome-512x512.png"],
  },
};

function DownloadLinks() {
  return (
    <div className={styles.actions}>
      <a className={styles.primary} href={storeUrl}>
        <span aria-hidden="true">↓</span> Get it on Zapstore{" "}
        <span aria-hidden="true">↗</span>
      </a>
      <a className={styles.secondary} href={releasesUrl}>
        Download APK <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

const features = [
  {
    icon: "⌕",
    title: "Find your people.",
    text: "Look up profiles by name, Nostr address, or public key. Explore their posts and keep following the conversation.",
    detail: "Names. Profiles. Connections.",
  },
  {
    icon: "▷",
    title: "More than words.",
    text: "Play videos right in your results. Open images in a swipeable gallery, zoom in, save your favorites, or share them.",
    detail: "Images. Video. Long-form reads.",
  },
  {
    icon: "↗",
    title: "Pick up the thread.",
    text: "Tap a reply to load its parent. Follow quoted notes, hashtags, and mentions. Open an event in another Nostr app.",
    detail: "One discovery leads to another.",
  },
  {
    icon: "⌘",
    title: "Make it personal.",
    text: "Connect Amber or another Android signer to search your own posts, mentions, and the people you follow.",
    detail: "Your keys stay with your signer.",
  },
];

export default function AndroidPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Android page">
        <Link href="/" className={styles.brand}>
          <Image src="/ant-blue.svg" alt="" width={27} height={32} />
          ants<span>/ android</span>
        </Link>
        <div>
          <a className={styles.featureLink} href="#features">
            Explore the app
          </a>
          <a href="#download" className={styles.navDownload}>
            Get ants <span aria-hidden="true">↗</span>
          </a>
        </div>
      </nav>

      <section className={styles.hero} aria-labelledby="android-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.status} /> NATIVE ON ANDROID
          </p>
          <h1 id="android-title">
            A little ant.
            <br />A whole world
            <br />
            to <span>discover.</span>
          </h1>
          <p className={styles.intro}>
            The power of Nostr search. Now in your pocket. Find that note,
            discover your people, and see where your curiosity takes you.
          </p>
          <DownloadLinks />
          <p className={styles.fine}>
            Free & open source <span>·</span> No account required
          </p>
        </div>
        <figure className={styles.showcase}>
          <div className={styles.orbit} aria-hidden="true" />
          <div className={styles.floatingTag}>small app. big curiosity.</div>
          <a
            className={styles.phone}
            href="/android/search-results.png"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Enlarge Android search results screenshot (opens in a new tab)"
          >
            <Image
              src="/android/search-results.png"
              alt="ants on Android showing a search with author and hashtag filters, image results, and replies"
              width={1008}
              height={2244}
              sizes="(max-width: 700px) 250px, 264px"
              priority
            />
          </a>
          <div className={styles.floatingQuery}>
            <span aria-hidden="true">⌕</span> (bitcoin OR freedom) since:1w
          </div>
          <figcaption className={styles.caption}>
            Real searches. Right in your pocket.
          </figcaption>
        </figure>
      </section>

      <div className={styles.trust}>
        <span>Built for Android</span>
        <span>Powered by Nostr</span>
        <span>Open source, always curious</span>
      </div>

      <section
        id="features"
        className={styles.features}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>FOLLOW YOUR CURIOSITY</p>
          <h2 id="features-title">
            Less scrolling.
            <br />
            <span>More finding.</span>
          </h2>
          <p>A familiar search box. A surprisingly powerful little app.</p>
        </div>
        <article className={styles.searchFeature}>
          <div>
            <span className={styles.featureNumber}>
              01 / SEARCH WITH PRECISION
            </span>
            <h3>
              Big questions.
              <br />
              Tiny search box.
            </h3>
            <p>
              Combine words, authors, hashtags, dates, and content types. Go
              broad, get specific, or build a query as curious as you are.
            </p>
            <Link href="/?q=%2Fhelp">
              Explore the search syntax <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className={styles.queries}>
            <div>
              <span>Find the conversation</span>
              <code>
                bitcoin <b>OR</b> lightning
              </code>
            </div>
            <div>
              <span>Catch up with a familiar voice</span>
              <code>
                GM <b>by:</b>dergigi <b>since:</b>2w
              </code>
            </div>
            <div>
              <span>Follow a spark of inspiration</span>
              <code>
                <b>is:</b>highlight <b>#</b>freedom
              </code>
            </div>
          </div>
        </article>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <article className={styles.card} key={feature.title}>
              <div className={styles.cardTop}>
                <span className={styles.icon} aria-hidden="true">
                  {feature.icon}
                </span>
                <span>0{index + 2}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <div className={styles.detail}>{feature.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.screenshots}
        aria-labelledby="screenshots-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>A CLOSER LOOK</p>
          <h2 id="screenshots-title">Put your curiosity to work.</h2>
          <p>
            From your first query to your next discovery. Tap a screen to take a
            closer look.
          </p>
        </div>
        <div className={styles.screenshotGrid}>
          {[
            {
              file: "search-results",
              title: "Find the good stuff.",
              text: "Notes, images, and replies together in your search results.",
              alt: "Search results with an image post and a reply on ants for Android",
            },
            {
              file: "query-breakdown",
              title: "See how your search works.",
              text: "Expand a query to see its author and hashtag combinations while ants searches.",
              alt: "Expanded OR query showing combinations of hashtags and authors while a search is running",
            },
            {
              file: "search-examples",
              title: "Start with a little inspiration.",
              text: "Open /examples and tap a query to explore authors, dates, and content types.",
              alt: "The Android examples screen with tappable queries for highlights, articles, dates, and more",
            },
          ].map((screen) => (
            <figure key={screen.file}>
              <a
                className={styles.screenshotLink}
                href={`/android/${screen.file}.png`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Enlarge: ${screen.title} (opens in a new tab)`}
              >
                <Image
                  src={`/android/${screen.file}.png`}
                  alt={screen.alt}
                  width={1008}
                  height={2244}
                  sizes="(max-width: 700px) 80vw, 320px"
                />
              </a>
              <figcaption>
                <h3>{screen.title}</h3>
                <p>{screen.text}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.freedom} aria-labelledby="freedom-title">
        <div className={styles.antTile}>
          <Image src="/ant-blue.svg" alt="" width={72} height={88} />
        </div>
        <div>
          <p className={styles.eyebrow}>SMALL FOOTPRINT. OPEN HORIZONS.</p>
          <h2 id="freedom-title">Just you and the nostrverse.</h2>
          <p>
            Start searching without an account. Choose your search relays. Keep
            your search history on your phone. Explore the code, too — ants is
            open source.
          </p>
          <a href="https://github.com/dergigi/ants-android">
            Take a look under the hood <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section
        id="download"
        className={styles.download}
        aria-labelledby="download-title"
      >
        <p className={styles.eyebrow}>TAKE YOUR CURIOSITY WITH YOU</p>
        <h2 id="download-title">
          Your next rabbit hole
          <br />
          is a tap away.
        </h2>
        <p>Meet ants for Android.</p>
        <DownloadLinks />
        <p className={styles.fine}>
          Available on Zapstore, or install the APK from GitHub.
        </p>
        <Link href="/" className={styles.webLink}>
          Prefer a bigger screen? Open ants on the web{" "}
          <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </main>
  );
}
