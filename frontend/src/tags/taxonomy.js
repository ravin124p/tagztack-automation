const q = (u, k) => u.searchParams.get(k);
const first = (...vals) => vals.find((v) => v != null && v !== '') || null;

export const VENDORS = [
  // --- Tag Management -----------------------------------------------------
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    vendor: 'Google',
    category: 'Tag Management',
    color: '#246FDB',
    icon: 'GTM',
    match: (u) => u.host === 'www.googletagmanager.com' && /^\/(gtm|ns)\.(js|html)$/.test(u.pathname),
    account: (u) => q(u, 'id'),
  },
  {
    id: 'gtag',
    name: 'Google Tag (gtag.js)',
    vendor: 'Google',
    category: 'Tag Management',
    color: '#4285F4',
    icon: 'GT',
    match: (u) => u.host === 'www.googletagmanager.com' && u.pathname === '/gtag/js',
    account: (u) => q(u, 'id'),
  },
  {
    id: 'tealium',
    name: 'Tealium iQ',
    vendor: 'Tealium',
    category: 'Tag Management',
    color: '#016A9F',
    icon: 'T',
    match: (u) => u.host === 'tags.tiqcdn.com' || u.host === 'collect.tealiumiq.com',
    account: (u) => {
      const m = u.pathname.match(/^\/utag\/([^/]+)\/([^/]+)/);
      return m ? `${m[1]}/${m[2]}` : null;
    },
  },
  {
    id: 'adobe-launch',
    name: 'Adobe Launch / DTM',
    vendor: 'Adobe',
    category: 'Tag Management',
    color: '#FA0F00',
    icon: 'AL',
    match: (u) => u.host === 'assets.adobedtm.com',
    account: (u) => {
      const m = u.pathname.match(/launch-([a-f0-9-]+)/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'ensighten',
    name: 'Ensighten',
    vendor: 'Ensighten',
    category: 'Tag Management',
    color: '#00A1DE',
    icon: 'En',
    match: (u) => u.host === 'nexus.ensighten.com',
    account: (u) => u.pathname.split('/')[1] || null,
  },

  // --- Web Analytics ------------------------------------------------------
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    vendor: 'Google',
    category: 'Web Analytics',
    color: '#F9AB00',
    icon: 'GA',
    match: (u) =>
      (/(^|\.)google-analytics\.com$/.test(u.host) || u.host === 'analytics.google.com') &&
      u.pathname.startsWith('/g/collect'),
    account: (u) => q(u, 'tid'),
  },
  {
    id: 'ua',
    name: 'Universal Analytics',
    vendor: 'Google',
    category: 'Web Analytics',
    color: '#E37400',
    icon: 'UA',
    match: (u) =>
      /(^|\.)google-analytics\.com$/.test(u.host) &&
      (u.pathname === '/collect' || u.pathname === '/j/collect' || u.pathname === '/r/collect'),
    account: (u) => q(u, 'tid'),
  },
  {
    id: 'adobe-analytics',
    name: 'Adobe Analytics',
    vendor: 'Adobe',
    category: 'Web Analytics',
    color: '#FA0F00',
    icon: 'AA',
    match: (u) =>
      /\.sc\.omtrdc\.net$/.test(u.host) ||
      /\.2o7\.net$/.test(u.host) ||
      /^smetrics\./.test(u.host) ||
      /^metrics\./.test(u.host) ||
      (u.host === 'adobedc.demdex.net' && /\/ee\/v\d+\//.test(u.pathname)),
    account: (u) =>
      q(u, 'configId') ||
      q(u, 'rsid') ||
      u.pathname.match(/\/b\/ss\/([^/]+)/)?.[1] ||
      null,
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    vendor: 'Mixpanel',
    category: 'Web Analytics',
    color: '#7856FF',
    icon: 'M',
    match: (u) => /(^|\.)mixpanel\.com$/.test(u.host),
    account: (u) => q(u, 'token'),
  },
  {
    id: 'amplitude',
    name: 'Amplitude',
    vendor: 'Amplitude',
    category: 'Web Analytics',
    color: '#1E61F0',
    icon: 'A',
    match: (u) => /(^|\.)amplitude\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'heap',
    name: 'Heap Analytics',
    vendor: 'Heap',
    category: 'Web Analytics',
    color: '#3A5BE0',
    icon: 'H',
    match: (u) => /heapanalytics\.com$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/\/h\/(\d+)/) || u.pathname.match(/\/js\/heap-(\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'segment',
    name: 'Segment',
    vendor: 'Segment',
    category: 'Web Analytics',
    color: '#52BD95',
    icon: 'S',
    match: (u) => u.host === 'api.segment.io' || u.host === 'cdn.segment.com',
    account: (u) => {
      const m = u.pathname.match(/\/analytics\.js\/v1\/([^/]+)/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'plausible',
    name: 'Plausible',
    vendor: 'Plausible',
    category: 'Web Analytics',
    color: '#5850EC',
    icon: 'P',
    match: (u) => u.host === 'plausible.io',
    account: () => null,
  },
  {
    id: 'fathom',
    name: 'Fathom Analytics',
    vendor: 'Fathom',
    category: 'Web Analytics',
    color: '#9060FF',
    icon: 'F',
    match: (u) => u.host === 'cdn.usefathom.com' || u.host === 'usefathom.com',
    account: () => null,
  },
  {
    id: 'matomo',
    name: 'Matomo',
    vendor: 'Matomo',
    category: 'Web Analytics',
    color: '#3152A5',
    icon: 'Mt',
    match: (u) => /matomo\.php|piwik\.php/.test(u.pathname),
    account: (u) => q(u, 'idsite'),
  },
  {
    id: 'quantcast',
    name: 'Quantcast',
    vendor: 'Quantcast',
    category: 'Web Analytics',
    color: '#00AEEF',
    icon: 'Q',
    match: (u) => /quantserve\.com$/.test(u.host),
    account: (u) => q(u, 'a'),
  },
  {
    id: 'siteimprove',
    name: 'Siteimprove Analytics',
    vendor: 'Siteimprove',
    category: 'Web Analytics',
    color: '#0F74B7',
    icon: 'Si',
    match: (u) => /siteimproveanalytics\.(com|io)$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/siteanalyze_(\d+)/);
      return first(m && m[1], u.host.split('.')[0].match(/^(\d+)/)?.[1]);
    },
  },

  // --- Advertising / Remarketing ------------------------------------------
  {
    id: 'google-ads',
    name: 'Google Ads Conversion',
    vendor: 'Google',
    category: 'Advertising',
    color: '#34A853',
    icon: 'GA',
    match: (u) =>
      u.host === 'www.googleadservices.com' ||
      (u.host === 'www.google.com' && /^\/(pagead|ads|ccm|gmp)/.test(u.pathname)) ||
      (u.host === 'googleads.g.doubleclick.net' && /pagead/.test(u.pathname)),
    account: (u) => {
      const m = u.pathname.match(/\/(?:conversion|viewthroughconversion|collect|1p-user-list)\/(\d+)/);
      return first(m && m[1], q(u, 'id'));
    },
  },
  {
    id: 'doubleclick',
    name: 'DoubleClick Floodlight',
    vendor: 'Google',
    category: 'Advertising',
    color: '#4285F4',
    icon: 'DC',
    match: (u) => /doubleclick\.net$/.test(u.host) && !/googleads\.g\.doubleclick\.net.*pagead/.test(u.href),
    account: (u) => {
      const m = u.pathname.match(/(?:src=|activity[i]?;src=)?(\d+)/);
      return first(q(u, 'src'), m && m[1]);
    },
  },
  {
    id: 'bing-uet',
    name: 'Microsoft Ads UET',
    vendor: 'Microsoft',
    category: 'Advertising',
    color: '#00A4EF',
    icon: 'B',
    match: (u) => /(^|\.)bing\.com$/.test(u.host) && /\/(bat|action)/.test(u.pathname),
    account: (u) => q(u, 'ti'),
  },
  {
    id: 'facebook-pixel',
    name: 'Facebook Pixel',
    vendor: 'Meta',
    category: 'Advertising',
    color: '#1877F2',
    icon: 'f',
    match: (u) =>
      (u.host === 'connect.facebook.net' && /fbevents/.test(u.pathname)) ||
      (u.host === 'www.facebook.com' && /^\/tr/.test(u.pathname)),
    account: (u) => {
      const m = u.pathname.match(/signals\/config\/(\d+)/);
      return first(q(u, 'id'), m && m[1]);
    },
  },
  {
    id: 'facebook-sandbox',
    name: 'Facebook Privacy Sandbox',
    vendor: 'Meta',
    category: 'Advertising',
    color: '#1877F2',
    icon: 'fS',
    match: (u) => u.host === 'www.facebook.com' && /privacy_sandbox|private_click|attribution/.test(u.pathname),
    account: (u) => q(u, 'id'),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Insight Tag',
    vendor: 'LinkedIn',
    category: 'Advertising',
    color: '#0A66C2',
    icon: 'in',
    match: (u) =>
      /px\.ads\.linkedin\.com$/.test(u.host) ||
      u.host === 'snap.licdn.com' ||
      u.host === 'www.linkedin.com' && /^\/px\//.test(u.pathname),
    account: (u) => q(u, 'pid'),
  },
  {
    id: 'twitter',
    name: 'X / Twitter Pixel',
    vendor: 'X',
    category: 'Advertising',
    color: '#000000',
    icon: 'X',
    match: (u) =>
      u.host === 'static.ads-twitter.com' ||
      u.host === 'analytics.twitter.com' ||
      u.host === 't.co',
    account: (u) => q(u, 'p_id') || q(u, 'txn_id'),
  },
  {
    id: 'tiktok',
    name: 'TikTok Pixel',
    vendor: 'TikTok',
    category: 'Advertising',
    color: '#000000',
    icon: 'Tt',
    match: (u) => /(^|\.)tiktok\.com$/.test(u.host) || u.host === 'analytics.tiktok.com',
    account: (u) => q(u, 'pixel_code') || q(u, 'sdkid'),
  },
  {
    id: 'pinterest',
    name: 'Pinterest Tag',
    vendor: 'Pinterest',
    category: 'Advertising',
    color: '#E60023',
    icon: 'P',
    match: (u) => /(^|\.)pinterest\.com$/.test(u.host) || u.host === 's.pinimg.com',
    account: (u) => q(u, 'tid'),
  },
  {
    id: 'snap',
    name: 'Snap Pixel',
    vendor: 'Snap',
    category: 'Advertising',
    color: '#FFFC00',
    icon: 'Sn',
    match: (u) => u.host === 'sc-static.net' || /(^|\.)snapchat\.com$/.test(u.host),
    account: (u) => q(u, 'pid'),
  },
  {
    id: 'reddit',
    name: 'Reddit Pixel',
    vendor: 'Reddit',
    category: 'Advertising',
    color: '#FF4500',
    icon: 'R',
    match: (u) => u.host === 'www.redditstatic.com' && /ads\/pixel/.test(u.pathname),
    account: () => null,
  },
  {
    id: 'criteo',
    name: 'Criteo',
    vendor: 'Criteo',
    category: 'Advertising',
    color: '#FF7F00',
    icon: 'C',
    match: (u) => /criteo\.(net|com)$/.test(u.host),
    account: (u) => q(u, 'a'),
  },
  {
    id: 'tradedesk',
    name: 'The Trade Desk',
    vendor: 'The Trade Desk',
    category: 'Advertising',
    color: '#F6361F',
    icon: 'TD',
    match: (u) => /adsrvr\.org$/.test(u.host),
    account: (u) => q(u, 'adv') || q(u, 'advertiser_id'),
  },
  {
    id: 'taboola',
    name: 'Taboola',
    vendor: 'Taboola',
    category: 'Advertising',
    color: '#0066CC',
    icon: 'Tb',
    match: (u) => /taboola\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'outbrain',
    name: 'Outbrain',
    vendor: 'Outbrain',
    category: 'Advertising',
    color: '#EE6B1B',
    icon: 'O',
    match: (u) => /outbrain\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'adroll',
    name: 'AdRoll',
    vendor: 'AdRoll',
    category: 'Advertising',
    color: '#FF7B2C',
    icon: 'AR',
    match: (u) => /adroll\.com$/.test(u.host) || u.host === 's.adroll.com',
    account: () => null,
  },
  {
    id: 'amazon-ads',
    name: 'Amazon Ads',
    vendor: 'Amazon',
    category: 'Advertising',
    color: '#FF9900',
    icon: 'a',
    match: (u) => u.host === 'c.amazon-adsystem.com' || u.host === 's.amazon-adsystem.com',
    account: (u) => q(u, 'pid'),
  },
  {
    id: 'nextdoor',
    name: 'Nextdoor Pixel',
    vendor: 'Nextdoor',
    category: 'Advertising',
    color: '#00B246',
    icon: 'Nd',
    match: (u) => /nextdoor\.com$/.test(u.host) && /(pixel|flask)/.test(u.href),
    account: (u) => q(u, 'pid') || q(u, 'id'),
  },
  {
    id: 'rubicon',
    name: 'Magnite / Rubicon',
    vendor: 'Magnite',
    category: 'Advertising',
    color: '#F37022',
    icon: 'Mg',
    match: (u) => /rubiconproject\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'appnexus',
    name: 'Xandr / AppNexus',
    vendor: 'Xandr',
    category: 'Advertising',
    color: '#9B4CFF',
    icon: 'Xn',
    match: (u) => /adnxs\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'tapad',
    name: 'Tapad',
    vendor: 'Tapad',
    category: 'Advertising',
    color: '#EB008B',
    icon: 'Tp',
    match: (u) => u.host === 'pixel.tapad.com',
    account: (u) => q(u, 'partner_id'),
  },

  // --- Data Management / Identity ----------------------------------------
  {
    id: 'adobe-audience-manager',
    name: 'Adobe Audience Manager',
    vendor: 'Adobe',
    category: 'Digital Measurement',
    color: '#FA0F00',
    icon: 'AM',
    match: (u) => /demdex\.net$/.test(u.host),
    account: (u) => u.host.split('.')[0],
  },
  {
    id: 'adobe-experience-edge',
    name: 'Adobe Experience Edge',
    vendor: 'Adobe',
    category: 'Digital Measurement',
    color: '#FA0F00',
    icon: 'AE',
    match: (u) => u.host === 'adobedc.demdex.net' || /\/ee\/v\d+\//.test(u.pathname),
    account: (u) => q(u, 'configId'),
  },
  {
    id: 'liveramp',
    name: 'LiveRamp',
    vendor: 'LiveRamp',
    category: 'Digital Measurement',
    color: '#1F2C88',
    icon: 'LR',
    match: (u) => /rlcdn\.com$/.test(u.host),
    account: (u) => u.pathname.split('/')[1] || null,
  },
  {
    id: 'zoominfo',
    name: 'ZoomInfo Loader',
    vendor: 'ZoomInfo',
    category: 'Digital Measurement',
    color: '#007BC0',
    icon: 'Zi',
    match: (u) => /(^|\.)zoominfo\.com$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/\/pixel\/(\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'demandbase',
    name: 'Demandbase',
    vendor: 'Demandbase',
    category: 'Digital Measurement',
    color: '#0F3A82',
    icon: 'Db',
    match: (u) => /demandbase\.com$/.test(u.host) || u.host === 'api.company-target.com',
    account: (u) => {
      const m = u.pathname.match(/([a-f0-9]{16,})/);
      return m ? m[1] : null;
    },
  },
  {
    id: '6sense',
    name: '6sense',
    vendor: '6sense',
    category: 'Digital Measurement',
    color: '#EC193C',
    icon: '6',
    match: (u) => /6sc\.co|6sense\.com$/.test(u.host),
    account: () => null,
  },

  // --- Session Replay / UX Analytics --------------------------------------
  {
    id: 'hotjar',
    name: 'Hotjar',
    vendor: 'Hotjar',
    category: 'Testing & Personalization',
    color: '#FD3A5C',
    icon: 'Hj',
    match: (u) => /hotjar\.(com|io)$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/\/(\d+)\.js|hotjar-(\d+)/);
      return m ? first(m[1], m[2]) : null;
    },
  },
  {
    id: 'fullstory',
    name: 'FullStory',
    vendor: 'FullStory',
    category: 'Testing & Personalization',
    color: '#FF008C',
    icon: 'FS',
    match: (u) => /fullstory\.com$/.test(u.host),
    account: (u) => q(u, 'OrgId'),
  },
  {
    id: 'quantum-metric',
    name: 'Quantum Metric',
    vendor: 'Quantum Metric',
    category: 'Testing & Personalization',
    color: '#00B4FF',
    icon: 'QM',
    match: (u) => /quantummetric\.com$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/\/horizon\/([^/?]+)/) || u.pathname.match(/quantum-([^.]+)\.js/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'logrocket',
    name: 'LogRocket',
    vendor: 'LogRocket',
    category: 'Testing & Personalization',
    color: '#764ABC',
    icon: 'LR',
    match: (u) => /logrocket\.(io|com)$/.test(u.host) || u.host === 'r.lr-ingest.com',
    account: () => null,
  },
  {
    id: 'mouseflow',
    name: 'Mouseflow',
    vendor: 'Mouseflow',
    category: 'Testing & Personalization',
    color: '#F57C00',
    icon: 'Mf',
    match: (u) => /mouseflow\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'clarity',
    name: 'Microsoft Clarity',
    vendor: 'Microsoft',
    category: 'Testing & Personalization',
    color: '#0078D4',
    icon: 'Cl',
    match: (u) => u.host === 'www.clarity.ms' || /clarity\.ms$/.test(u.host),
    account: () => null,
  },
  {
    id: 'crazyegg',
    name: 'Crazy Egg',
    vendor: 'CrazyEgg',
    category: 'Testing & Personalization',
    color: '#F47A7A',
    icon: 'Ce',
    match: (u) => /crazyegg\.com$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/pages\/scripts\/(\d+\/\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'inspectlet',
    name: 'Inspectlet',
    vendor: 'Inspectlet',
    category: 'Testing & Personalization',
    color: '#21B573',
    icon: 'Il',
    match: (u) => /inspectlet\.com$/.test(u.host),
    account: () => null,
  },

  // --- A/B Testing --------------------------------------------------------
  {
    id: 'optimizely',
    name: 'Optimizely',
    vendor: 'Optimizely',
    category: 'Testing & Personalization',
    color: '#0037FF',
    icon: 'Op',
    match: (u) => /optimizely\.com$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/\/(\d{8,})/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'vwo',
    name: 'VWO',
    vendor: 'VWO',
    category: 'Testing & Personalization',
    color: '#F57321',
    icon: 'VW',
    match: (u) => /visualwebsiteoptimizer\.com$/.test(u.host) || /vwo\.com$/.test(u.host),
    account: (u) => q(u, 'a'),
  },
  {
    id: 'adobe-target',
    name: 'Adobe Target',
    vendor: 'Adobe',
    category: 'Testing & Personalization',
    color: '#FA0F00',
    icon: 'AT',
    match: (u) => /\.tt\.omtrdc\.net$/.test(u.host),
    account: (u) => u.host.split('.')[0],
  },
  {
    id: 'monetate',
    name: 'Monetate',
    vendor: 'Monetate',
    category: 'Testing & Personalization',
    color: '#C01E2D',
    icon: 'Mo',
    match: (u) => /monetate\.net$/.test(u.host),
    account: () => null,
  },

  // --- Consent & Privacy --------------------------------------------------
  {
    id: 'onetrust',
    name: 'OneTrust CMP',
    vendor: 'OneTrust',
    category: 'Privacy & Consent',
    color: '#7DC242',
    icon: 'ot',
    match: (u) => /cookielaw\.org$/.test(u.host) || /onetrust\.com$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/consent\/([a-f0-9-]+)/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'trustarc',
    name: 'TrustArc',
    vendor: 'TrustArc',
    category: 'Privacy & Consent',
    color: '#005EB8',
    icon: 'Ta',
    match: (u) => /trustarc\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'cookiebot',
    name: 'Cookiebot',
    vendor: 'Cookiebot',
    category: 'Privacy & Consent',
    color: '#004B87',
    icon: 'Cb',
    match: (u) => /cookiebot\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'didomi',
    name: 'Didomi',
    vendor: 'Didomi',
    category: 'Privacy & Consent',
    color: '#2D3AE9',
    icon: 'Dd',
    match: (u) => /didomi\.io$/.test(u.host) || u.host === 'sdk.privacy-center.org',
    account: () => null,
  },
  {
    id: 'usercentrics',
    name: 'Usercentrics',
    vendor: 'Usercentrics',
    category: 'Privacy & Consent',
    color: '#00AEEF',
    icon: 'Uc',
    match: (u) => /usercentrics\.eu$/.test(u.host),
    account: () => null,
  },
  {
    id: 'qualtrics',
    name: 'Qualtrics Site Intercept',
    vendor: 'Qualtrics',
    category: 'Privacy & Consent',
    color: '#00B4EF',
    icon: 'Qu',
    match: (u) => /qualtrics\.com$/.test(u.host),
    account: (u) => q(u, 'BrandID') || q(u, 'SurveyID'),
  },

  // --- Marketing Automation / CRM -----------------------------------------
  {
    id: 'hubspot',
    name: 'HubSpot',
    vendor: 'HubSpot',
    category: 'Social Media',
    color: '#FF7A59',
    icon: 'Hs',
    match: (u) => /(hs-scripts|hs-analytics|hubspot\.com|hsforms)/.test(u.href),
    account: (u) => {
      const m = u.pathname.match(/\/(\d{4,})\.js/);
      return m ? m[1] : null;
    },
  },
  {
    id: 'marketo',
    name: 'Marketo Munchkin',
    vendor: 'Marketo',
    category: 'Social Media',
    color: '#5C4C9F',
    icon: 'Mk',
    match: (u) => /marketo\.(net|com)$/.test(u.host) || /mktoresp\.com$/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/\/(\d{3,})\//);
      return first(m && m[1], u.host.split('.')[0]);
    },
  },
  {
    id: 'pardot',
    name: 'Salesforce Pardot',
    vendor: 'Salesforce',
    category: 'Social Media',
    color: '#00A1E0',
    icon: 'Pd',
    match: (u) => /pardot\.com$/.test(u.host),
    account: (u) => q(u, 'piAId'),
  },
  {
    id: 'eloqua',
    name: 'Oracle Eloqua',
    vendor: 'Oracle',
    category: 'Social Media',
    color: '#F80000',
    icon: 'Eq',
    match: (u) => /eloqua\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    vendor: 'Mailchimp',
    category: 'Social Media',
    color: '#FFE01B',
    icon: 'Mc',
    match: (u) => /(list-manage\.com|mailchimp\.com)$/.test(u.host),
    account: () => null,
  },
  {
    id: 'klaviyo',
    name: 'Klaviyo',
    vendor: 'Klaviyo',
    category: 'Social Media',
    color: '#000000',
    icon: 'Kl',
    match: (u) => /klaviyo\.com$/.test(u.host),
    account: (u) => q(u, 'company_id'),
  },
  {
    id: 'invoca',
    name: 'Invoca',
    vendor: 'Invoca',
    category: 'Social Media',
    color: '#F47522',
    icon: 'Iv',
    match: (u) => /invoca(cdn|\.net)/.test(u.host),
    account: (u) => {
      const m = u.pathname.match(/\/(\d{4,})\//);
      return m ? m[1] : null;
    },
  },

  // --- Customer Support / Chat --------------------------------------------
  {
    id: 'intercom',
    name: 'Intercom',
    vendor: 'Intercom',
    category: 'Social Media',
    color: '#1F8DED',
    icon: 'Ic',
    match: (u) => /intercom\.(io|com)$/.test(u.host) || /intercomcdn\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    vendor: 'Zendesk',
    category: 'Social Media',
    color: '#03363D',
    icon: 'Zd',
    match: (u) => /zdassets\.com$|zendesk\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'drift',
    name: 'Drift',
    vendor: 'Drift',
    category: 'Social Media',
    color: '#0B76FA',
    icon: 'Dr',
    match: (u) => /driftt\.com|drift\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'livechat',
    name: 'LiveChat',
    vendor: 'LiveChat',
    category: 'Social Media',
    color: '#FFD000',
    icon: 'Lc',
    match: (u) => /livechatinc\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'glance',
    name: 'Glance Cobrowse',
    vendor: 'Glance',
    category: 'Social Media',
    color: '#0A8F8F',
    icon: 'Gl',
    match: (u) => /glance(cdn|\.net)/.test(u.host),
    account: (u) => q(u, 'group'),
  },

  // --- Attribution / Mobile ----------------------------------------------
  {
    id: 'branch',
    name: 'Branch',
    vendor: 'Branch',
    category: 'Advertising',
    color: '#7B3FF2',
    icon: 'Br',
    match: (u) => /branch\.io$/.test(u.host),
    account: () => null,
  },
  {
    id: 'appsflyer',
    name: 'AppsFlyer',
    vendor: 'AppsFlyer',
    category: 'Advertising',
    color: '#0066FF',
    icon: 'Af',
    match: (u) => /appsflyer\.com$/.test(u.host),
    account: () => null,
  },
  {
    id: 'impact',
    name: 'Impact Radius',
    vendor: 'Impact',
    category: 'Advertising',
    color: '#0072CE',
    icon: 'Im',
    match: (u) => /impact(radius|-ad)/.test(u.host) || u.host === 'd.impactradius-event.com',
    account: (u) => u.pathname.split('/').filter(Boolean)[0] || null,
  },

  // --- Schema / SEO -------------------------------------------------------
  {
    id: 'schemaapp',
    name: 'SchemaApp',
    vendor: 'SchemaApp',
    category: 'Web Analytics',
    color: '#0BA4D1',
    icon: 'Sa',
    match: (u) => /schemaapp\.com$/.test(u.host),
    account: (u) => u.pathname.split('/')[1] || null,
  },

  // --- Performance / Error Monitoring ------------------------------------
  {
    id: 'new-relic',
    name: 'New Relic Browser',
    vendor: 'New Relic',
    category: 'Web Analytics',
    color: '#00AC69',
    icon: 'NR',
    match: (u) => u.host === 'js-agent.newrelic.com' || /nr-data\.net$/.test(u.host),
    account: () => null,
  },
  {
    id: 'sentry',
    name: 'Sentry',
    vendor: 'Sentry',
    category: 'Web Analytics',
    color: '#362D59',
    icon: 'Sn',
    match: (u) => /sentry(-cdn|io)|\.sentry\./.test(u.host),
    account: () => null,
  },
  {
    id: 'datadog-rum',
    name: 'Datadog RUM',
    vendor: 'Datadog',
    category: 'Web Analytics',
    color: '#632CA6',
    icon: 'Dd',
    match: (u) => /datadog(hq|-rum)|browser-intake-datadoghq/.test(u.host),
    account: () => null,
  },
  {
    id: 'cloudflare-insights',
    name: 'Cloudflare Insights',
    vendor: 'Cloudflare',
    category: 'Web Analytics',
    color: '#F38020',
    icon: 'Cf',
    match: (u) => u.host === 'static.cloudflareinsights.com',
    account: () => null,
  },
];

export const CATEGORY_COLORS = {
  'Tag Management': '#4F46E5',
  'Web Analytics': '#0891B2',
  'Advertising': '#DC2626',
  'Digital Measurement': '#F59E0B',
  'Testing & Personalization': '#7C3AED',
  'Privacy & Consent': '#059669',
  'Social Media': '#EC4899',
  'Uncategorized': '#6B7280',
};
