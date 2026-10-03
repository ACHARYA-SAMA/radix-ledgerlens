/* Repository touch marker. */
import type { Transaction, BeneficiaryChange, VoiceNote, AnalyticsSummary } from '../types/finance';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx_nov_001',
    date: '2026-09-29',
    rawNarration: 'RTGS/R26092900881/APEXINFRA_SOLUTIONS/ICIC0000102/FACTORY_STRUCT',
    cleanedNarration: 'Apex Infra Solutions Ltd - Warehouse Shed Structural Work',
    amount: 485000,
    type: 'debit',
    rail: 'RTGS',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Capital Assets & Infrastructure',
    subCategory: 'Factory Shed Civil Construction',
    vendorClientName: 'Apex Infra Solutions Pvt Ltd',
    gstin: '27AAACA5120M1ZO',
    itcEligible: false, // Blocked under Section 17(5)(c) of CGST Act (immovable property)
    tdsSection: '194C - Contractor (2%)',
    status: 'flagged_fraud',
    confidence: 62,
    citation: {
      type: 'rule',
      ruleId: 'SEC-FRAUD-007',
      ruleName: 'Beneficiary Alteration Anomaly Rule',
      explanation: 'Beneficiary account was changed 4 days ago. Payment amount (₹4,85,000) exceeds threshold for recently modified accounts. Penny drop returned name mismatch: Registered "Apex Infra Solutions", Account Holder "Sunil K Patel".',
      confidence: 62,
      sourceDocument: 'NPCI Penny Drop API Ref: PD-2026-9281'
    },
    fraudWarning: {
      severity: 'critical',
      reason: 'Beneficiary bank details changed 4 days ago from ICICI to Kotak Bank with distinct IFSC. Penny-drop response returned individual beneficiary name instead of registered corporate GSTIN entity.',
      beneficiaryModifiedDaysAgo: 4,
      previousIfsc: 'ICIC0000102',
      newIfsc: 'KKBK0001928',
      previousAccount: '010205008192',
      newAccount: '992810003418',
      coolingOffPeriodExpired: false,
      pennyDropStatus: 'name_mismatch'
    },
    shareToken: 'apex-fraud-warn-2026',
    notes: 'Payout auto-held by Account Aggregator (AA) Bank Sync Fraud Sentinel. Requires physical signoff by Managing Director.'
  },
  {
    id: 'tx_nov_002',
    date: '2026-09-28',
    rawNarration: 'NEFT/N260928004812/SRIBALAJITRANS/HDFC0000042/INV_7812',
    cleanedNarration: 'Sri Balaji Transport Co - Inward Freight Bhiwandi to Bangalore',
    amount: 54200,
    type: 'debit',
    rail: 'NEFT',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Freight & Inward Logistics',
    subCategory: 'Goods Transport Agency (GTA)',
    vendorClientName: 'Sri Balaji Transport Corporation',
    gstin: '27AAACB2019A1Z4',
    itcEligible: true,
    tdsSection: '194C - GTA Exemption (Declaration Filed)',
    status: 'categorized',
    confidence: 99,
    citation: {
      type: 'rule',
      ruleId: 'VR-RULE-402',
      ruleName: 'Master Vendor Registry PAN / GSTIN Match',
      explanation: 'Exact match with active vendor "Sri Balaji Transport Corp". GSTIN 27AAACB2019A1Z4 verified on GST Portal. Valid GTA declaration on file for FY 2026-27.',
      confidence: 99,
      sourceDocument: 'Master Vendor Agreement & FY26 Declaration',
      matchingKey: 'GSTIN:27AAACB2019A1Z4'
    },
    shareToken: 'balaji-freight-sep26'
  },
  {
    id: 'tx_nov_003',
    date: '2026-09-28',
    rawNarration: 'UPI/629103910294/AWS_CLOUD_IN/HDFCBK/INVOICE_AWS_99182',
    cleanedNarration: 'Amazon Web Services India - Production Kubernetes Cluster',
    amount: 88400,
    type: 'debit',
    rail: 'UPI',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Software & Cloud Infrastructure',
    subCategory: 'Cloud Hosting & Compute',
    vendorClientName: 'Amazon Web Services India Pvt Ltd',
    gstin: '29AABCA9028L1ZV',
    itcEligible: true,
    tdsSection: '194J - Fees for Technical Services (2%)',
    status: 'categorized',
    confidence: 98,
    citation: {
      type: 'historical_pattern',
      ruleName: 'Recurring SaaS Billing Schedule',
      explanation: 'Matches 14 consecutive monthly billings for AWS India Cloud Infrastructure with 18% IGST input credit pass-through.',
      confidence: 98,
      sourceDocument: 'Recurring Subscription Contract #AWS-IN-889'
    },
    shareToken: 'aws-cloud-sep26'
  },
  {
    id: 'tx_nov_004',
    date: '2026-09-27',
    rawNarration: 'UPI/402849182049/PAYTM_QR_STORE/9820019284@PAYTM',
    cleanedNarration: 'Paytm Merchant QR - Local Electronics Market Lamington Rd',
    amount: 14500,
    type: 'debit',
    rail: 'UPI',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Office & Computer Hardware',
    subCategory: 'IT Peripherals & Replacement SSDs',
    vendorClientName: 'Mahavir Infotech (Paytm QR)',
    gstin: undefined,
    itcEligible: false,
    tdsSection: undefined,
    status: 'needs_review',
    confidence: 68,
    citation: {
      type: 'llm_inference',
      ruleName: 'Account Aggregator (AA) Bank Sync Semantic Entity Extractor',
      explanation: 'Narration indicates retail hardware merchant in Mumbai IT cluster. Inferred "IT Equipment", but lacks tax invoice and registered GSTIN on record.',
      confidence: 68,
      sourceDocument: 'UPI VPA Resolver: 9820019284@paytm'
    },
    shareToken: 'paytm-hardware-rev'
  },
  {
    id: 'tx_nov_005',
    date: '2026-09-27',
    rawNarration: 'RTGS/R26092700192/TATASTEELCOMLTD/UTIB0000010/COIL_PURCHASE',
    cleanedNarration: 'Tata Steel Ltd - HR Coils Consignment Lot #449',
    amount: 1845000,
    type: 'debit',
    rail: 'RTGS',
    accountNumber: 'ICICI Cash Credit ...9121',
    bankName: 'ICICI Bank',
    category: 'Direct Raw Materials & Steel',
    subCategory: 'Hot Rolled Steel Coils',
    vendorClientName: 'Tata Steel Ltd',
    gstin: '20AAACT2702H1ZZ',
    itcEligible: true,
    tdsSection: '194Q - Purchase of Goods > 50L (0.1%)',
    status: 'categorized',
    confidence: 99,
    citation: {
      type: 'gstin_match',
      ruleName: 'GSTR-2B Auto-Recon Engine',
      explanation: 'Matched with Supplier GSTR-1 e-Invoice IRN 4f8a... filed by Tata Steel on 26 Sep. Full ITC (₹2,81,440 CGST+SGST) verified.',
      confidence: 99,
      sourceDocument: 'GSTR-2B IRN: 4f8a0029b47e2819'
    },
    shareToken: 'tata-steel-purchase-sep'
  },
  {
    id: 'tx_nov_006',
    date: '2026-09-26',
    rawNarration: 'NEFT/N260926002941/INFOSYS_BPM_LTD/SBIN0001920/RETAINER_SEP',
    cleanedNarration: 'Infosys BPM Ltd - Q2 Enterprise Software Consulting Retainer',
    amount: 1420000,
    type: 'credit',
    rail: 'NEFT',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Client Revenue & Consulting',
    subCategory: 'IT Implementation Services',
    vendorClientName: 'Infosys BPM Ltd',
    gstin: '29AABCI2931F1ZS',
    itcEligible: false,
    tdsSection: 'TDS Deducted by Client: 194J (10%)',
    status: 'categorized',
    confidence: 100,
    citation: {
      type: 'rule',
      ruleId: 'REV-RECOG-014',
      ruleName: 'Outward Invoicing E-Way/IRN Cross Match',
      explanation: 'Exact match with Outward Tax Invoice INV-2026-442 issued to Infosys BPM. Net received ₹14,20,000 against ₹15,77,778 billing (₹1,57,778 TDS deducted under 194J).',
      confidence: 100,
      sourceDocument: 'Outward Invoice INV-2026-442'
    },
    shareToken: 'infosys-revenue-sep26'
  },
  {
    id: 'tx_nov_007',
    date: '2026-09-26',
    rawNarration: 'IMPS/P26092600492/CHAI POINT/KORAMANGALA/STAFF_REFRESH',
    cleanedNarration: 'Chai Point Koramangala - Office Pantry & Staff Refreshments',
    amount: 3840,
    type: 'debit',
    rail: 'IMPS',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Staff Welfare & Refreshments',
    subCategory: 'Pantry Expenses',
    vendorClientName: 'Mountain Trail Foods Pvt Ltd (Chai Point)',
    gstin: '29AAACM6942K1ZR',
    itcEligible: false, // Blocked under Sec 17(5)(b)(i) (food and beverages)
    status: 'categorized',
    confidence: 96,
    citation: {
      type: 'llm_inference',
      ruleName: 'Account Aggregator (AA) Bank Sync Semantic Entity Extractor',
      explanation: 'Food & beverage merchant identified. Auto-flagged as non-creditable input tax under CGST Section 17(5)(b)(i) Food & Beverage restrictions.',
      confidence: 96,
      sourceDocument: 'Merchant Descriptor: CHAI POINT'
    },
    shareToken: 'chai-point-pantry'
  },
  {
    id: 'tx_nov_008',
    date: '2026-09-25',
    rawNarration: 'UPI/402910481928/RAVI_KUMAR_ADVANCE/AIRP0000001',
    cleanedNarration: 'UPI to Ravi Kumar - Field Site Advance Expense',
    amount: 25000,
    type: 'debit',
    rail: 'UPI',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Employee Travel & Imprest Advances',
    subCategory: 'Site Travel Advance',
    vendorClientName: 'Ravi Kumar (Site Supervisor)',
    gstin: undefined,
    itcEligible: false,
    status: 'needs_review',
    confidence: 72,
    citation: {
      type: 'llm_inference',
      ruleName: 'Account Aggregator (AA) Bank Sync Semantic Entity Extractor',
      explanation: 'Transfer to employee UPI handle. Marked as Imprest Advance, pending physical voucher submission and bill reconciliation within 7 days.',
      confidence: 72,
      sourceDocument: 'Employee Registry Record: EMP-042'
    },
    shareToken: 'ravi-imprest-advance'
  },
  {
    id: 'tx_nov_009',
    date: '2026-09-24',
    rawNarration: 'NACH/N004819284/TATA_CAPITAL_FIN_EMI/TERM_LOAN_449',
    cleanedNarration: 'Tata Capital Financial Services - Plant & Machinery Term Loan EMI',
    amount: 148200,
    type: 'debit',
    rail: 'NACH',
    accountNumber: 'HDFC Current ...1928',
    bankName: 'HDFC Bank',
    category: 'Debt Servicing & Finance Costs',
    subCategory: 'Term Loan Principal & Interest',
    vendorClientName: 'Tata Capital Financial Services Ltd',
    gstin: '27AABCT2391F1Z2',
    itcEligible: false,
    status: 'categorized',
    confidence: 100,
    citation: {
      type: 'rule',
      ruleId: 'LOAN-SCHED-003',
      ruleName: 'Loan Amortization Auto-Splitter',
      explanation: 'Scheduled NACH mandate. Split automatically: Principal repayment ₹1,12,000 (Dr. Loan Liability), Interest ₹36,200 (Dr. Finance Charges).',
      confidence: 100,
      sourceDocument: 'Sanction Letter TCFSL/TL/2024/099'
    },
    shareToken: 'tata-cap-loan-emi'
  },
  {
    id: 'tx_nov_010',
    date: '2026-09-23',
    rawNarration: 'NEFT/N260923009182/KALYAN_PRINTING_PRESS/PUNB0029100',
    cleanedNarration: 'Kalyan Printing Press - Packaging Boxes & Corrugated Cartons',
    amount: 42000,
    type: 'debit',
    rail: 'NEFT',
    accountNumber: 'Axis Operative ...0101',
    bankName: 'Axis Bank',
    category: 'Packaging Materials & Consumables',
    subCategory: 'Corrugated Paper Boxes',
    vendorClientName: 'Kalyan Art & Printing Works',
    gstin: '27AAFPK4920K1ZM',
    itcEligible: true,
    tdsSection: '194C - Contractor (1% Individual)',
    status: 'needs_review',
    confidence: 78,
    citation: {
      type: 'llm_inference',
      ruleName: 'Account Aggregator (AA) Bank Sync Semantic Entity Extractor',
      explanation: 'Vendor PAN fourth letter is "P" (Sole Proprietorship). TDS deducted at 1% instead of standard 2% corporate rate. Pending CA verification of MSME Certificate.',
      confidence: 78,
      sourceDocument: 'Bank Narration token: KALYAN_PRINTING_PRESS'
    },
    shareToken: 'kalyan-printing-carton'
  }
];

export const INITIAL_BENEFICIARY_CHANGES: BeneficiaryChange[] = [
  {
    id: 'ben_chg_001',
    vendorName: 'Apex Infra Solutions Pvt Ltd',
    gstin: '27AAACA5120M1ZO',
    changeDate: '2026-09-25',
    daysAgo: 4,
    oldAccount: '010205008192 (ICICI Bank)',
    newAccount: '992810003418 (Kotak Mahindra)',
    oldIfsc: 'ICIC0000102',
    newIfsc: 'KKBK0001928',
    changedBy: 'Account Aggregator (AA) Bank Sync',
    coolingOffHoursRemaining: 68,
    pennyDropStatus: 'name_mismatch',
    scheduledPayoutsTotal: 485000,
    activeStatus: 'frozen'
  },
  {
    id: 'ben_chg_002',
    vendorName: 'Dynamic Logistics Express',
    gstin: '29AABBD8820P1ZX',
    changeDate: '2026-09-20',
    daysAgo: 9,
    oldAccount: '502000281928 (HDFC Bank)',
    newAccount: '002910400018 (State Bank of India)',
    oldIfsc: 'HDFC0000029',
    newIfsc: 'SBIN0004018',
    changedBy: 'Account Aggregator (AA) Bank Sync',
    coolingOffHoursRemaining: 0,
    pennyDropStatus: 'verified',
    scheduledPayoutsTotal: 122000,
    activeStatus: 'verified'
  },
  {
    id: 'ben_chg_003',
    vendorName: 'Shree Balaji Polymers',
    gstin: '24AAFPS8819L1Z5',
    changeDate: '2026-09-28',
    daysAgo: 1,
    oldAccount: '33180201009182 (Union Bank)',
    newAccount: '92402001928410 (Axis Bank)',
    oldIfsc: 'UBIN0533181',
    newIfsc: 'UTIB0000240',
    changedBy: 'Account Aggregator (AA) Bank Sync',
    coolingOffHoursRemaining: 164,
    pennyDropStatus: 'pending',
    scheduledPayoutsTotal: 340000,
    activeStatus: 'under_review'
  }
];

export const INITIAL_VOICE_NOTES: VoiceNote[] = [
  {
    id: 'vn_001',
    recordedAt: 'Today, 11:20 AM',
    durationSeconds: 14,
    transcript: 'Paid forty-five thousand rupees to Sri Balaji Transport via NEFT yesterday afternoon for warehouse transport from Bhiwandi to Bangalore.',
    extractedEntity: 'Sri Balaji Transport Co',
    extractedAmount: 45000,
    extractedCategory: 'Freight & Inward Logistics',
    matchedTransactionId: 'tx_nov_002',
    status: 'reconciled'
  },
  {
    id: 'vn_002',
    recordedAt: 'Yesterday, 04:45 PM',
    durationSeconds: 19,
    transcript: 'Gave twenty-five thousand rupees advance to Ravi Kumar site engineer via UPI for urgent diesel generator rental and civil supplies at Whitefield plant.',
    extractedEntity: 'Ravi Kumar (Site Supervisor)',
    extractedAmount: 25000,
    extractedCategory: 'Employee Travel & Imprest Advances',
    matchedTransactionId: 'tx_nov_008',
    status: 'pending_match'
  }
];

export const ANALYTICS_DATA: AnalyticsSummary = {
  cashPosition: 14285420, // ₹1.43 Cr
  inflowThisMonth: 6840000, // ₹68.4 L
  outflowThisMonth: 4185000, // ₹41.85 L
  eligibleItcClaim: 982440, // ₹9.82 L ITC
  reviewQueueCount: 3,
  fraudAlertsCount: 1,
  categorizationAccuracyPct: 97.4
};
