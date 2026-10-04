import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const storeUrl = "https://zapstore.dev/apps/org.dergigi.ants";
const releasesUrl = "https://github.com/dergigi/ants-android/releases/latest";
const description =
  "Fast, native Nostr search for Android. Powerful query syntax, a shared ANTLR grammar, and Vertex-powered profile discovery. No account required.";

export const metadata: Metadata = {
  title: "ants for Android — nostr search. In your pocket",
  description,
  alternates: { canonical: "/android" },
  openGraph: {
    title: "ants for Android",
    description,
    url: "/android",
    images: [
      {
        url: "/android/og.png?v=2",
        width: 1200,
        height: 630,
        alt: "ants for Android — nostr search. In your pocket. Search notes, find your people, and follow your curiosity.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ants for Android",
    description,
    images: [
      {
        url: "/android/og.png?v=2",
        alt: "ants for Android — nostr search. In your pocket",
      },
    ],
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
    icon: "( )",
    title: "Powered by ANTLR.",
    text: "A real query language, built on a shared ANTLR grammar. Nest groups, combine AND and OR, and scope filters with the same syntax on Android and the web.",
    detail: "One grammar. Both platforms.",
  },
  {
    icon: "⌕",
    title: "Find people with Vertex.",
    text: "Discover profiles with Vertex search and personalized PageRank. Connect your Android signer for personalized discovery, with relay search as a fallback.",
    detail: "Profile search with social context.",
  },
  {
    icon: "↗",
    title: "Native to your phone.",
    text: "Built in Kotlin with Jetpack Compose. Native navigation, image galleries, and video playback, with Android sharing and signer integration built in.",
    detail: "Made for Android.",
  },
  {
    icon: "ϟ",
    title: "Built to feel fast.",
    text: "Search relays directly. Cached profile lookups speed up repeat searches, while back navigation restores your results and scroll position within the session.",
    detail: "Less waiting. Keep exploring.",
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
            Powerful query syntax. Vertex-powered profile discovery. A fast,
            native Android app that puts Nostr search in your pocket.
          </p>
          <DownloadLinks />
          <p className={styles.fine}>
            Free & open source <span>·</span> No account required
          </p>
        </div>
        <figure className={styles.showcase}>
          <div className={styles.orbit} aria-hidden="true" />
          <div className={styles.floatingTag}>
            native app. powerful queries.
          </div>
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
        <span>Native Android</span>
        <span>ANTLR query language</span>
        <span>Vertex profile search</span>
      </div>

      <section
        id="features"
        className={styles.features}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>BUILT FOR SEARCH</p>
          <h2 id="features-title">
            Less scrolling.
            <br />
            <span>More finding.</span>
          </h2>
          <p>Precise queries. Relevant profiles. Native speed.</p>
        </div>
        <article className={styles.searchFeature}>
          <div>
            <span className={styles.featureNumber}>
              01 / POWERFUL QUERY SYNTAX
            </span>
            <h3>
              Say exactly what
              <br />
              you’re looking for.
            </h3>
            <p>
              Combine text, authors, hashtags, dates, and content types. Use
              AND, OR, and nested groups to narrow your search. Scope a filter
              to a whole group, or search the people you follow with
              by:@contacts.
            </p>
            <Link href="/?q=%2Fhelp">
              Explore the search syntax <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className={styles.queries}>
            <div>
              <span>Combine terms and narrow by date</span>
              <code>
                (bitcoin <b>OR</b> lightning) <b>since:</b>1w
              </code>
            </div>
            <div>
              <span>Catch up with a familiar voice</span>
              <code>
                GM <b>by:</b>dergigi <b>since:</b>2w
              </code>
            </div>
            <div>
              <span>Read articles from your contacts</span>
              <code>
                <b>is:</b>article <b>by:</b>@contacts
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
          <h2 id="screenshots-title">From query to results.</h2>
          <p>
            See the syntax, inspect your query, and browse native results. Tap a
            screen to take a closer look.
          </p>
        </div>
        <div className={styles.screenshotGrid}>
          {[
            {
              file: "search-results",
              title: "Native results.",
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
              title: "Learn the query language.",
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
          <p className={styles.eyebrow}>OPEN SOURCE. SHARED FOUNDATIONS.</p>
          <h2 id="freedom-title">The grammar is open, too.</h2>
          <p>
            The Android app and ants on the web share an ANTLR grammar and query
            fixtures. Explore how the language works, inspect the native app, or
            help improve both. It’s all open source.
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
        <p className={styles.eyebrow}>POWERFUL SEARCH. READY TO GO.</p>
        <h2 id="download-title">
          Nostr search.
          <br />
          Native. Fast. In your pocket.
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
