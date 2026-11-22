const SITE = 'https://dewaotp.my.id';

export default function sitemap() {
  return [{
    url: SITE,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1
  }];
}
