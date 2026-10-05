import { SiteFooter, Wordmark } from "@/components/home/site-chrome";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { copy } from "@/lib/ui-copy";
import { JoinForm } from "./join-form";
import "../home.css";

export const metadata = { title: copy.join.title };

export default async function JoinPage() {
  const settings = await getPlatformSettings();
  return (
    <div className="home" data-testid="join-page">
      <main className="home-wrap home-narrow">
        <header>
          <Wordmark name={settings.productName} />
          <h1 className="home-title">{copy.join.title}</h1>
          <p className="home-lede">{copy.join.intro}</p>
        </header>
        <JoinForm />
        <SiteFooter />
      </main>
    </div>
  );
}
