import MarketingNav from './marketing-nav';
import MarketingHero from './marketing-hero';
import FeatureSection from './feature-section';
import WorkflowSection from './workflow-section';
import MarketingCTA from './marketing-cta';
import MarketingFooter from './marketing-footer';

export default function MarketingPage() {
  return <main className="marketing"><MarketingNav /><MarketingHero /><FeatureSection /><WorkflowSection /><MarketingCTA /><MarketingFooter /></main>;
}
