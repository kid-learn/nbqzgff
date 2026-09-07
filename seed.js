'use strict';

// q = question, o = four options, a = index of the correct option, c = category
const QUESTIONS = [
  { q: 'NABARD was set up on the recommendation of which committee?', o: ['Narasimham Committee', 'Sivaraman Committee (CRAFICARD)', 'Kelkar Committee', 'Rangarajan Committee'], a: 1, c: 'Foundation' },
  { q: 'On which date was NABARD established?', o: ['12 July 1982', '1 April 1935', '19 July 1969', '2 October 1975'], a: 0, c: 'Foundation' },
  { q: 'Under which Act was NABARD established?', o: ['Banking Regulation Act, 1949', 'RBI Act, 1934', 'NABARD Act, 1981', 'Companies Act, 1956'], a: 2, c: 'Foundation' },
  { q: 'Where is the head office of NABARD located?', o: ['New Delhi', 'Mumbai', 'Pune', 'Hyderabad'], a: 1, c: 'Foundation' },
  { q: 'What does CRAFICARD stand for?', o: ['Committee to Review Arrangements for Institutional Credit for Agriculture and Rural Development', 'Council for Rural Agriculture Finance and Credit Development', 'Commission for Rural Finance in Agriculture and Cooperative Development', 'Committee for Rural Agricultural Finance and Industrial Credit'], a: 0, c: 'Foundation' },
  { q: 'NABARD began operations with an initial share capital of:', o: ['Rs 50 crore', 'Rs 100 crore', 'Rs 500 crore', 'Rs 1,000 crore'], a: 1, c: 'Foundation' },
  { q: 'Which corporation was merged into NABARD when it was formed?', o: ['Industrial Finance Corporation of India', 'Agricultural Refinance and Development Corporation', 'Rural Electrification Corporation', 'Small Industries Development Bank of India'], a: 1, c: 'Foundation' },
  { q: 'NABARD celebrates its Foundation Day on:', o: ['12 July', '1 April', '15 August', '26 January'], a: 0, c: 'Foundation' },
  { q: 'The NABARD (Amendment) Act notified in 2018 raised its authorised capital to:', o: ['Rs 5,000 crore', 'Rs 10,000 crore', 'Rs 20,000 crore', 'Rs 30,000 crore'], a: 3, c: 'Foundation' },
  { q: 'Who holds the entire share capital of NABARD today?', o: ['Reserve Bank of India', 'Government of India', 'State Bank of India', 'Jointly by all state governments'], a: 1, c: 'Foundation' },
  { q: 'What does RIDF stand for?', o: ['Rural Infrastructure Development Fund', 'Regional Industrial Development Fund', 'Rural Income Development Facility', 'Rural Investment and Debt Fund'], a: 0, c: 'Funds' },
  { q: 'In which year was the Rural Infrastructure Development Fund set up with NABARD?', o: ['1990-91', '1992-93', '1995-96', '2000-01'], a: 2, c: 'Funds' },
  { q: 'The first tranche of RIDF was launched with a corpus of:', o: ['Rs 500 crore', 'Rs 1,000 crore', 'Rs 2,000 crore', 'Rs 5,000 crore'], a: 2, c: 'Funds' },
  { q: 'Resources for the RIDF are contributed from:', o: ['Shortfall in priority sector lending by commercial banks', 'A cess on agricultural produce', 'Direct budgetary grants only', 'Foreign sovereign borrowings'], a: 0, c: 'Funds' },
  { q: 'Loans under RIDF are extended primarily to:', o: ['Individual farmers', 'State governments and state-owned corporations', 'Foreign investors', 'Urban municipal bodies only'], a: 1, c: 'Funds' },
  { q: 'The Long Term Irrigation Fund was set up with an initial corpus of:', o: ['Rs 5,000 crore', 'Rs 10,000 crore', 'Rs 20,000 crore', 'Rs 50,000 crore'], a: 2, c: 'Funds' },
  { q: 'The Long Term Irrigation Fund was created to fast-track how many stalled irrigation projects?', o: ['49', '99', '150', '250'], a: 1, c: 'Funds' },
  { q: 'The Warehouse Infrastructure Fund was created with NABARD in:', o: ['2010-11', '2011-12', '2013-14', '2015-16'], a: 2, c: 'Funds' },
  { q: 'The Warehouse Infrastructure Fund was set up with a corpus of:', o: ['Rs 1,000 crore', 'Rs 2,500 crore', 'Rs 5,000 crore', 'Rs 10,000 crore'], a: 2, c: 'Funds' },
  { q: 'The Watershed Development Fund was created with NABARD in:', o: ['1995-96', '1999-2000', '2005-06', '2010-11'], a: 1, c: 'Funds' },
  { q: 'The Tribal Development Fund of NABARD mainly supports:', o: ['Wadi or orchard-based livelihood projects for tribal families', 'Urban housing for migrant workers', 'Export promotion for handicrafts', 'Setting up rural petrol pumps'], a: 0, c: 'Funds' },
  { q: 'The Dairy Processing and Infrastructure Development Fund supports:', o: ['Import of dairy cattle', 'Modernisation of dairy processing infrastructure', 'Retail milk pricing subsidies', 'Fodder imports'], a: 1, c: 'Funds' },
  { q: 'FIDF, operated with NABARD support, relates to which sector?', o: ['Forestry', 'Fisheries and aquaculture', 'Floriculture', 'Food retail'], a: 1, c: 'Funds' },
  { q: 'The Micro Irrigation Fund is operated by:', o: ['SIDBI', 'NABARD', 'EXIM Bank', 'NHB'], a: 1, c: 'Funds' },
  { q: 'NIDA, a NABARD product that complements RIDF, stands for:', o: ['NABARD Infrastructure Development Assistance', 'National Irrigation Development Authority', 'NABARD Industrial Development Advance', 'National Institute for Development of Agriculture'], a: 0, c: 'Funds' },
  { q: 'The Self Help Group-Bank Linkage Programme was launched as a pilot in:', o: ['1982', '1992', '1998', '2005'], a: 1, c: 'Inclusion' },
  { q: 'The SHG-Bank Linkage pilot began with approximately how many self help groups?', o: ['50', '500', '5,000', '50,000'], a: 1, c: 'Inclusion' },
  { q: 'The SHG-Bank Linkage Programme is widely described as:', o: ['India\u2019s first crop insurance scheme', 'The world\u2019s largest microfinance programme', 'A rural housing subsidy scheme', 'A crop procurement platform'], a: 1, c: 'Inclusion' },
  { q: 'The Kisan Credit Card scheme was introduced in:', o: ['1992', '1995', '1998', '2004'], a: 2, c: 'Inclusion' },
  { q: 'Project e-Shakti of NABARD was launched to:', o: ['Digitise self help groups', 'Provide solar pumps to farmers', 'Set up rural ATMs', 'Train bank officers online'], a: 0, c: 'Inclusion' },
  { q: 'JLG, promoted by NABARD, stands for:', o: ['Joint Liability Group', 'Joint Lending Guarantee', 'Junior Loan Guild', 'Joint Livelihood Grant'], a: 0, c: 'Inclusion' },
  { q: 'A Joint Liability Group typically consists of how many members?', o: ['2 to 3', '4 to 10', '15 to 20', '25 to 30'], a: 1, c: 'Inclusion' },
  { q: 'NAFIS, conducted by NABARD, stands for:', o: ['NABARD All India Rural Financial Inclusion Survey', 'National Agricultural Finance and Insurance Scheme', 'NABARD Agricultural Farm Income Study', 'National Fund for Inclusive Savings'], a: 0, c: 'Inclusion' },
  { q: 'FPO, widely supported by NABARD, stands for:', o: ['Farm Produce Outlet', 'Farmer Producer Organisation', 'Food Processing Operation', 'Farm Policy Office'], a: 1, c: 'Inclusion' },
  { q: 'Which of these does NABARD promote to link rural women to banking services?', o: ['Bank Sakhi', 'Bank Mitra Ltd', 'Gram Teller', 'Rural Cashier Scheme'], a: 0, c: 'Inclusion' },
  { q: 'NABARD conducts statutory inspections of which institutions?', o: ['Only private sector banks', 'State cooperative banks, district central cooperative banks and RRBs', 'Insurance companies', 'Stock exchanges'], a: 1, c: 'Supervision' },
  { q: 'NABARD carries out statutory inspection of rural banks under which law?', o: ['Companies Act, 2013', 'Banking Regulation Act, 1949', 'SARFAESI Act, 2002', 'FEMA, 1999'], a: 1, c: 'Supervision' },
  { q: 'Which institution retains licensing authority over cooperative banks?', o: ['NABARD', 'Reserve Bank of India', 'SEBI', 'Ministry of Finance'], a: 1, c: 'Supervision' },
  { q: 'PLP, prepared annually by NABARD, stands for:', o: ['Potential Linked Credit Plan', 'Priority Lending Plan', 'Public Ledger Programme', 'Planned Loan Portfolio'], a: 0, c: 'Supervision' },
  { q: 'Potential Linked Credit Plans are prepared by NABARD at which level?', o: ['Village', 'Block', 'District', 'National'], a: 2, c: 'Supervision' },
  { q: 'The annual document NABARD prepares to guide state-level credit planning is called the:', o: ['State Focus Paper', 'State Budget Note', 'Rural Credit Gazette', 'Annual Farm Report'], a: 0, c: 'Supervision' },
  { q: 'PACS, the base tier of the short term cooperative credit structure, stands for:', o: ['Primary Agricultural Credit Society', 'Public Agricultural Cooperative Scheme', 'Panchayat Agricultural Credit Service', 'Primary Association of Crop Sellers'], a: 0, c: 'Supervision' },
  { q: 'In the short term cooperative credit structure, PACS operate at which level?', o: ['Village', 'District', 'State', 'National'], a: 0, c: 'Supervision' },
  { q: 'In the three-tier cooperative credit structure, DCCBs operate at which level?', o: ['Village', 'District', 'State', 'Regional'], a: 1, c: 'Supervision' },
  { q: 'As a rule, NABARD provides credit to farmers:', o: ['Directly through its own branches', 'Through refinance to banks and rural financial institutions', 'Only through post offices', 'Through state treasuries'], a: 1, c: 'Structure' },
  { q: 'Which of the following is NOT a function of NABARD?', o: ['Refinancing rural lending institutions', 'Supervising cooperative banks and RRBs', 'Issuing currency notes', 'Preparing district credit plans'], a: 2, c: 'Structure' },
  { q: 'NABCONS is the NABARD subsidiary engaged in:', o: ['Consultancy services', 'Life insurance', 'Commodity trading', 'Mutual funds'], a: 0, c: 'Structure' },
  { q: 'NABKISAN Finance Limited, a NABARD subsidiary, mainly lends to:', o: ['Farmer producer organisations and rural enterprises', 'Large steel plants', 'Urban housing developers', 'Overseas agri exporters'], a: 0, c: 'Structure' },
  { q: 'NABARD serves as India\u2019s National Implementing Entity for which climate finance mechanism?', o: ['Adaptation Fund', 'World Trade Organization', 'Asian Development Bank', 'International Monetary Fund'], a: 0, c: 'Development' },
  { q: 'UPNRM, a NABARD programme, relates to:', o: ['Natural resource management', 'Urban public transport', 'Nuclear research', 'Naval logistics'], a: 0, c: 'Development' }
];

const FEEDBACK = [
  'How would you rate your overall experience at the NABARD Pavilion?',
  'How informative did you find the quiz?',
  'How likely are you to recommend our pavilion to others?'
];

const SETTINGS = {
  welcomeTitle: "Welcome to NABARD's Pavilion",
  welcomeSubtitle: 'Take a quiz and win goodies!',
  questionsPerAttempt: 10,
  passThreshold: 8,
  idleResetSeconds: 60,
  thankYouSeconds: 5,
  wallpaperCycleSeconds: 5,
  congratsMessage: 'Congratulations! You win a gift! Please collect from our team.',
  consolationMessage: 'Thanks for taking the NABARD quiz. Do visit our team at the pavilion.',
  feedbackRequireAll: true,
  kioskCode: '120782'
};

module.exports = { QUESTIONS, FEEDBACK, SETTINGS };
