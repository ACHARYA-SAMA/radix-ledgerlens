export interface ArchitectureNode {
  id: string;
  label: string;
  type: 'ingestion' | 'ner_embedding' | 'vector_search' | 'decision_gate' | 'llm_reasoning' | 'sentinel_anomaly' | 'tax_engine' | 'ledger_output';
  systemName: string; // e.g. "Finacle Ingest Gateway", "BERT-Fin-Tokenizer", "Qdrant Vector Index"
  status: 'passed' | 'failed' | 'active' | 'skipped' | 'diverged';
  metrics: {
    latencyMs: number;
    confidenceScore?: number;
    decisionCriteria?: string;
    evaluatedCondition?: string;
  };
  humanExplanation: string;
  deepInspection: {
    inputTensorOrPayload: string;
    internalLogic: string;
    outputResult: string;
    hyperparameters?: Record<string, string | number>;
  };
  childrenIds?: string[];
  divergentChildId?: string; // e.g. Fraud branch
}

export interface TraceScenario {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  rawNarration: string;
  amount: number;
  rail: string;
  vendorName: string;
  activePathIds: string[]; // List of node IDs traversed in this scenario
  finalOutcome: {
    status: 'categorized' | 'flagged_fraud' | 'needs_review';
    glAccount: string;
    itcEligible: boolean;
    reasonSummary: string;
  };
  nodes: Record<string, ArchitectureNode>;
}

export const ARCHITECTURE_SCENARIOS: TraceScenario[] = [
  // SCENARIO 1: BENEFICIARY TAMPERING ANOMALY (CRITICAL FRAUD DIVERGENCE)
  {
    id: 'scenario_fraud_sentinel',
    title: '1. Beneficiary Alteration Sentinel Branch',
    subtitle: 'Graph Neural Network & NPCI Penny Drop Anomaly Interception',
    badge: 'FRAUD FORK',
    badgeColor: 'bg-red-600 text-white border-red-400',
    rawNarration: 'RTGS/R26092900881/APEXINFRA_SOLUTIONS/KKBK0001928/CIVIL_SHED_FAB',
    amount: 485000,
    rail: 'RTGS',
    vendorName: 'Apex Infra Solutions Pvt Ltd',
    activePathIds: [
      'node_ingest',
      'node_token_ner',
      'node_vector_registry',
      'gate_beneficiary_risk',
      'node_fraud_isolation',
      'node_escrow_lockdown'
    ],
    finalOutcome: {
      status: 'flagged_fraud',
      glAccount: 'Suspense Clearing / Escrow Lock',
      itcEligible: false,
      reasonSummary: 'Beneficiary account was changed 4 days ago (< 168hr cooling off). Penny-drop returned individual name mismatch "Sunil K Patel" vs registered "Apex Infra Solutions". Remittance intercepted and frozen.'
    },
    nodes: {
      node_ingest: {
        id: 'node_ingest',
        label: 'Finacle Ingest Gateway',
        type: 'ingestion',
        systemName: 'Finacle ISO20022 Webhook Pipeline',
        status: 'passed',
        metrics: {
          latencyMs: 3.2,
          decisionCriteria: 'Message Schema Validation: Valid ISO20022 MT940 pacs.008'
        },
        humanExplanation: 'Bank statement line ingested via Real-Time Gross Settlement (RTGS) webhook. Payload integrity and cryptographic signature validated.',
        deepInspection: {
          inputTensorOrPayload: '{"MsgId": "RTGS/R26092900881", "Amt": 485000, "Dbtr": "HDFC_CURR_1928", "Cdtr": "APEXINFRA_SOLUTIONS", "CdtrAcct": "992810003418", "CdtrIFSC": "KKBK0001928"}',
          internalLogic: 'SchemaValidator.verify(pacs008) -> Pass CRC32 Checksum 0x9AF84B21',
          outputResult: 'Normalized Bank Transaction Packet #TX-RTGS-9281'
        },
        childrenIds: ['node_token_ner']
      },
      node_token_ner: {
        id: 'node_token_ner',
        label: 'Regex & FinBERT Tokenizer',
        type: 'ner_embedding',
        systemName: 'BERT-FinNER Entity Extractor (Indian Rail v4.2)',
        status: 'passed',
        metrics: {
          latencyMs: 12.8,
          confidenceScore: 99.4,
          evaluatedCondition: 'Entity Extract: [ORG: APEXINFRA_SOLUTIONS], [RAIL: RTGS], [PURP: CIVIL_SHED]'
        },
        humanExplanation: 'FinBERT model parsed raw statement string into discrete named entities, isolating the counterparty token and removing transaction tracking noise.',
        deepInspection: {
          inputTensorOrPayload: 'Token Array: ["RTGS", "/", "R26092900881", "/", "APEXINFRA", "_", "SOLUTIONS", "/", "KKBK0001928", "/", "CIVIL", "_", "SHED"]',
          internalLogic: 'BiLSTM-CRF Sequence Labeling -> Entities: Counterparty="APEXINFRA_SOLUTIONS", IFSC="KKBK0001928", Intent="CIVIL_SHED"',
          outputResult: 'Sanitized Entity Vector: Apex Infra Solutions Pvt Ltd (IFSC: KKBK0001928)',
          hyperparameters: { vocab_size: 32000, max_seq_len: 64, temperature: 0.0 }
        },
        childrenIds: ['node_vector_registry']
      },
      node_vector_registry: {
        id: 'node_vector_registry',
        label: 'Master Vendor & GSTIN Match',
        type: 'vector_search',
        systemName: 'Qdrant Dense Embedding Index + GSTIN Portal API',
        status: 'passed',
        metrics: {
          latencyMs: 24.1,
          confidenceScore: 97.2,
          evaluatedCondition: 'Cosine Similarity: 0.972 >= 0.900 Threshold'
        },
        humanExplanation: 'Cross-referenced against corporate Master Vendor Directory. Matched verified GSTIN 27AAACA5120M1ZO for Apex Infra Solutions Pvt Ltd.',
        deepInspection: {
          inputTensorOrPayload: 'Query Vector: 768-dim BERT dense representation of "Apex Infra Solutions"',
          internalLogic: 'HNSW Cosine KNN Search across 4,200 supplier embeddings -> Top Match ID: "VENDOR_APEX_2024"',
          outputResult: 'Vendor Record: Apex Infra Solutions Pvt Ltd | GSTIN: 27AAACA5120M1ZO | Historical Payouts: ₹38.2 Lakhs'
        },
        childrenIds: ['gate_beneficiary_risk']
      },
      gate_beneficiary_risk: {
        id: 'gate_beneficiary_risk',
        label: 'Beneficiary Tampering Decision Gate',
        type: 'decision_gate',
        systemName: 'RBI Cyber Security Sentinel (Circular DBS.CO.PPD.03/2020)',
        status: 'diverged',
        metrics: {
          latencyMs: 18.5,
          decisionCriteria: 'IF (BeneficiaryModifiedDays <= 7 OR PennyDropStatus == "name_mismatch") -> DIVERGE_FRAUD'
        },
        humanExplanation: 'CRITICAL DECISION GATE: The system checked bank account alteration history. Beneficiary details were edited 4 days ago (cooling-off rule violation). NPCI Penny Drop returned a person name "Sunil K Patel" instead of the corporate entity.',
        deepInspection: {
          inputTensorOrPayload: 'Beneficiary Mod Date: 26-Sep-2026 (4 days ago) | Registered Name: "Apex Infra Solutions" | NPCI Penny Drop Name: "Sunil K Patel"',
          internalLogic: 'Evaluated: cooling_off_hours_left = 72 > 0; penny_drop_similarity = 0.21 < 0.85 (MISMATCH). Rule triggered: SEC-FRAUD-007',
          outputResult: 'DECISION FORK -> DIVERGE TO FRAUD ISOLATION SENTINEL (Skip standard GL posting)'
        },
        divergentChildId: 'node_fraud_isolation',
        childrenIds: ['node_tax_classifier'] // Standard happy path is skipped
      },
      node_fraud_isolation: {
        id: 'node_fraud_isolation',
        label: 'Fraud Sentinel Branch & Risk Score',
        type: 'sentinel_anomaly',
        systemName: 'Isolation Forest Anomaly Classifier (Ensemble v2.9)',
        status: 'active',
        metrics: {
          latencyMs: 8.4,
          confidenceScore: 99.8,
          evaluatedCondition: 'Anomaly Score: 0.984 (Extreme Outlier Risk)'
        },
        humanExplanation: 'The anomaly isolation model classified this transaction as extreme risk. The alteration fingerprint matches high-yield corporate account takeover techniques.',
        deepInspection: {
          inputTensorOrPayload: 'Features: [amount=485000, days_since_acct_change=4, penny_name_levenshtein=0.21, rail=RTGS, user_role=Junior Accountant]',
          internalLogic: 'IsolationForest.predict() -> Anomaly Score: 0.984. Alert Level: CRITICAL_SEVERITY_1',
          outputResult: 'Sent PUSH Notification to Chief Financial Officer & Head of Internal Audit'
        },
        childrenIds: ['node_escrow_lockdown']
      },
      node_escrow_lockdown: {
        id: 'node_escrow_lockdown',
        label: 'Escrow Lockdown & Auto-Freeze',
        type: 'ledger_output',
        systemName: 'Finacle Dual-Key Cryptographic Escrow Vault',
        status: 'active',
        metrics: {
          latencyMs: 14.2,
          decisionCriteria: 'Remittance Frozen: ₹4,85,000 locked until dual CA cryptographic signature'
        },
        humanExplanation: 'Outward RTGS transfer intercepted and quarantined. Zero funds released to Kotak Bank account. Voucher held in Suspense Escrow.',
        deepInspection: {
          inputTensorOrPayload: 'Action: HALT_TRANSACTION_PAYOUT; Target IFSC: KKBK0001928; Account: 992810003418',
          internalLogic: 'Lock Ledger State -> Set transaction_status = "flagged_fraud"; generate Share Token "apex-fraud-warn-2026"',
          outputResult: 'FROZEN IN ESCROW. Awaiting forensic verification.'
        }
      }
    }
  },

  // SCENARIO 2: NOVA AI REASONING ON UNKNOWN RETAIL VENDOR (WITH TAX BLOCKING)
  {
    id: 'scenario_nova_llm',
    title: '2. Nova AI Neural Reasoning',
    subtitle: 'Zero-Shot Semantic Intent Mapping & CGST Sec 17(5) Blocking',
    badge: 'LLM INFERENCE',
    badgeColor: 'bg-zinc-800 text-white border-white/40 shadow-sm',
    rawNarration: 'UPI/529104819284/CHAI_POINT_BANGALORE/tea@axis/004812',
    amount: 1420,
    rail: 'UPI',
    vendorName: 'Mountain Trail Foods (Chai Point)',
    activePathIds: [
      'node_ingest',
      'node_token_ner',
      'node_vector_registry',
      'gate_registry_match',
      'node_nova_llm',
      'node_tax_classifier',
      'node_double_entry_gl'
    ],
    finalOutcome: {
      status: 'categorized',
      glAccount: 'Staff Welfare & Refreshments (Office Pantry)',
      itcEligible: false,
      reasonSummary: 'Nova AI identified retail beverage vendor from UPI VPA. Rule TAX-SEC175-01 blocked Input Tax Credit under CGST Act Section 17(5)(b)(i).'
    },
    nodes: {
      node_ingest: {
        id: 'node_ingest',
        label: 'Finacle Ingest Gateway',
        type: 'ingestion',
        systemName: 'Finacle UPI Switch Gateway',
        status: 'passed',
        metrics: { latencyMs: 2.1, decisionCriteria: 'UPI 2.0 Inward RRN: 529104819284' },
        humanExplanation: 'Instant UPI payout ingested from corporate operative account.',
        deepInspection: {
          inputTensorOrPayload: '{"RRN": "529104819284", "Amt": 1420, "VPA": "tea@axis", "Narration": "CHAI_POINT_BANGALORE"}',
          internalLogic: 'NPCI UPI Webhook Verified -> Timestamp 2026-09-30 08:34:11 IST',
          outputResult: 'Packet #TX-UPI-4812'
        },
        childrenIds: ['node_token_ner']
      },
      node_token_ner: {
        id: 'node_token_ner',
        label: 'Regex & VPA De-anonymizer',
        type: 'ner_embedding',
        systemName: 'NPCI VPA Virtual Payment Address Resolver',
        status: 'passed',
        metrics: { latencyMs: 8.5, confidenceScore: 94.2 },
        humanExplanation: 'Extracted merchant VPA handle "tea@axis" and commercial string "CHAI_POINT_BANGALORE".',
        deepInspection: {
          inputTensorOrPayload: 'VPA: tea@axis | Handle: axis | Merchant Descriptor: CHAI POINT',
          internalLogic: 'Regex Match: (CHAI|COFFEE|TEA) -> Pantry/Food merchant category code (MCC 5814)',
          outputResult: 'Cleaned Descriptor: "Chai Point - Bangalore Corporate Office"'
        },
        childrenIds: ['node_vector_registry']
      },
      node_vector_registry: {
        id: 'node_vector_registry',
        label: 'Registry Similarity Search',
        type: 'vector_search',
        systemName: 'Qdrant Master Vendor Vector Space',
        status: 'passed',
        metrics: { latencyMs: 19.3, evaluatedCondition: 'Max Cosine Similarity: 0.612 < 0.900' },
        humanExplanation: 'Similarity score against approved master vendor contracts was 0.612, which fell below the 0.900 auto-match threshold. Routing to Nova AI Neural Classifier.',
        deepInspection: {
          inputTensorOrPayload: 'Query: "Chai Point Bangalore" -> Nearest Vendor: "Chai Garam Foods" (Score 0.612)',
          internalLogic: 'Threshold Check: 0.612 < 0.900 -> Exact Contract Match Failed. Escalate to LLM Reasoning Pipeline.',
          outputResult: 'ESCALATE_TO_LLM'
        },
        childrenIds: ['node_nova_llm']
      },
      node_nova_llm: {
        id: 'node_nova_llm',
        label: 'Nova AI Reasoning Engine',
        type: 'llm_reasoning',
        systemName: 'Nova AI (Fine-Tuned on Indian Schedule III Accounting)',
        status: 'passed',
        metrics: {
          latencyMs: 240.5,
          confidenceScore: 96.8,
          evaluatedCondition: 'Top-1 Classification: Staff Welfare & Refreshments (Logits: 0.968)'
        },
        humanExplanation: 'Nova AI analyzed the merchant context, transaction size (₹1,420), and business hour timing. It mapped the expense directly to Schedule III Chart of Accounts: "Staff Welfare & Refreshments".',
        deepInspection: {
          inputTensorOrPayload: 'Prompt: Classify "CHAI_POINT_BANGALORE UPI tea@axis Rs 1420" under Companies Act 2013 Chart of Accounts.',
          internalLogic: 'Attention heads focused on "CHAI_POINT" and "Rs 1420" -> Determined office beverages for team meeting.',
          outputResult: 'Category: "Staff Welfare & Refreshments" | SubCategory: "Office Pantry & Beverages" | Confidence: 96.8%',
          hyperparameters: { model: 'nova-ai-1.0', temperature: 0.1, top_p: 0.95 }
        },
        childrenIds: ['node_tax_classifier']
      },
      node_tax_classifier: {
        id: 'node_tax_classifier',
        label: 'Statutory GST Tax Reasoner',
        type: 'tax_engine',
        systemName: 'CBIC GST Compliance Rule Engine (Sec 16 & 17)',
        status: 'passed',
        metrics: {
          latencyMs: 4.1,
          decisionCriteria: 'CGST Act Section 17(5)(b)(i) Food & Beverage Blocking Rule'
        },
        humanExplanation: 'CRITICAL AUDIT SHIELD: Food and beverage expenses are explicitly blocked from Input Tax Credit claims under Section 17(5)(b)(i) of the CGST Act. The engine automatically marked ITC as Ineligible to protect the CA from tax audit penalty notices.',
        deepInspection: {
          inputTensorOrPayload: 'GL Category: "Staff Welfare & Refreshments" | Tax Head: CGST + SGST (18%)',
          internalLogic: 'Rule TAX-SEC175-01: IF category IN ["Food", "Beverages", "Outdoor Catering", "Club Membership"] THEN Set itc_eligible = FALSE',
          outputResult: 'ITC Blocked (Ineligible under Section 17(5)). No GST credit claimed.'
        },
        childrenIds: ['node_double_entry_gl']
      },
      node_double_entry_gl: {
        id: 'node_double_entry_gl',
        label: 'Double-Entry Journal Posting',
        type: 'ledger_output',
        systemName: 'Aczen Nova General Ledger Subsystem',
        status: 'passed',
        metrics: { latencyMs: 6.2, decisionCriteria: 'Balanced Voucher: Dr. Staff Welfare ₹1,420 | Cr. HDFC Operative ₹1,420' },
        humanExplanation: 'Balanced journal voucher committed with full audit citation and tax treatment notes.',
        deepInspection: {
          inputTensorOrPayload: 'Debit: 4120-001 (Staff Welfare) ₹1,420 | Credit: 1110-002 (Bank) ₹1,420',
          internalLogic: 'VoucherGenerator.post() -> Immutability Hash: 0x4891b29a',
          outputResult: 'Committed to Live Ledger. Ready for GSTR-3B audit export.'
        }
      }
    }
  },

  // SCENARIO 3: MASTER VENDOR EXACT RULE WITH GSTR-2B IRN AUTO-MATCH
  {
    id: 'scenario_gstr2b_match',
    title: '3. Master Vendor & GSTR-2B IRN Auto-Match',
    subtitle: 'High-Volume Deterministic Rule Pipeline (Zero-Latency B2B Recon)',
    badge: 'DETERMINISTIC',
    badgeColor: 'bg-blue-600 text-white border-blue-400',
    rawNarration: 'NEFT/N260928001928/SRIBALAJITRANS/HDFC0000001/INV4928_BHIWANDI',
    amount: 54200,
    rail: 'NEFT',
    vendorName: 'Sri Balaji Transport Corporation',
    activePathIds: [
      'node_ingest',
      'node_token_ner',
      'node_vector_registry',
      'node_gstr2b_portal',
      'node_tax_classifier',
      'node_double_entry_gl'
    ],
    finalOutcome: {
      status: 'categorized',
      glAccount: 'Freight & Inward Logistics (Goods Transport Agency)',
      itcEligible: true,
      reasonSummary: 'Exact match in Master Vendor Registry with GSTIN 27AAACB2019A1Z4. GSTR-2B IRN auto-reconciled. Full ITC claimed with GTA 194C exemption declaration.'
    },
    nodes: {
      node_ingest: {
        id: 'node_ingest',
        label: 'Finacle Ingest Gateway',
        type: 'ingestion',
        systemName: 'Finacle Corporate Bulk NEFT Ingest',
        status: 'passed',
        metrics: { latencyMs: 2.8, decisionCriteria: 'UTR N260928001928 Authenticated' },
        humanExplanation: 'Corporate outward NEFT remittance confirmed by RBI settlement batch.',
        deepInspection: {
          inputTensorOrPayload: '{"UTR": "N260928001928", "Amt": 54200, "Remitter": "Aczen Tech", "Beneficiary": "SRIBALAJITRANS"}',
          internalLogic: 'NEFT Clearing Ack 200 OK',
          outputResult: 'Transaction Packet #TX-NEFT-1928'
        },
        childrenIds: ['node_token_ner']
      },
      node_token_ner: {
        id: 'node_token_ner',
        label: 'FinBERT Tokenizer & Regex',
        type: 'ner_embedding',
        systemName: 'Regex Extraction Model v4.2',
        status: 'passed',
        metrics: { latencyMs: 9.1, confidenceScore: 99.8 },
        humanExplanation: 'Isolated invoice number "INV4928" and logistics route "Bhiwandi".',
        deepInspection: {
          inputTensorOrPayload: 'Tokens: [SRIBALAJITRANS, INV4928, BHIWANDI]',
          internalLogic: 'Entity Extractor: VendorKey="SRIBALAJITRANS", InvoiceRef="INV4928"',
          outputResult: 'Identified: Sri Balaji Transport Corporation'
        },
        childrenIds: ['node_vector_registry']
      },
      node_vector_registry: {
        id: 'node_vector_registry',
        label: 'Master Vendor Registry Exact Rule',
        type: 'vector_search',
        systemName: 'Deterministic In-Memory Rule Index (VR-RULE-402)',
        status: 'passed',
        metrics: { latencyMs: 3.5, confidenceScore: 100, evaluatedCondition: 'Exact Key Match: "SRIBALAJITRANS"' },
        humanExplanation: 'Exact string match on Master Vendor Registry. Retrieved supplier tax profile with verified GSTIN 27AAACB2019A1Z4.',
        deepInspection: {
          inputTensorOrPayload: 'Vendor Key: SRIBALAJITRANS',
          internalLogic: 'Rule Engine VR-RULE-402 -> GSTIN: 27AAACB2019A1Z4 | GTA Declaration FY 2026-27: ON_FILE',
          outputResult: 'Direct Classification: Freight & Inward Logistics (GTA)'
        },
        childrenIds: ['node_gstr2b_portal']
      },
      node_gstr2b_portal: {
        id: 'node_gstr2b_portal',
        label: 'GST System GSTR-2B IRN Recon',
        type: 'tax_engine',
        systemName: 'NIC GST Portal e-Invoice e-Way Bill API',
        status: 'passed',
        metrics: { latencyMs: 31.4, confidenceScore: 100, evaluatedCondition: 'IRN Match: 4f8a0029b47e2819' },
        humanExplanation: 'Live GST portal cross-check: Vendor filed GSTR-1 for invoice INV-4928. Auto-reconciled against company GSTR-2B statement.',
        deepInspection: {
          inputTensorOrPayload: 'IRN: 4f8a0029b47e2819... | Supplier: Sri Balaji Transport Corp | Taxable Val: ₹50,000 | GST: ₹4,200',
          internalLogic: 'Match GSTR-2B Row #9182 -> Status: RECONCILED_MATCHED',
          outputResult: 'Invoice Authenticated on GSTN Portal'
        },
        childrenIds: ['node_tax_classifier']
      },
      node_tax_classifier: {
        id: 'node_tax_classifier',
        label: 'TDS & Input Tax Credit Engine',
        type: 'tax_engine',
        systemName: 'Income Tax Sec 194C + CGST Sec 16 Module',
        status: 'passed',
        metrics: { latencyMs: 5.2, decisionCriteria: 'TDS: 194C Exempt (Declaration on file) | ITC: 100% Eligible' },
        humanExplanation: 'Goods Transport Agency (GTA) declaration in Form 43B on file, exempting TDS under Section 194C(6). Input Tax Credit fully claimable under Section 16.',
        deepInspection: {
          inputTensorOrPayload: 'Vehicle Count <= 10 -> Sec 194C(6) Exemption Valid | Inward GSTR-2B Match Valid',
          internalLogic: 'TDS Rate: 0% (Declaration Valid) | ITC Credit: ₹4,200 (Full Claim)',
          outputResult: 'Tax Compliance Cleared'
        },
        childrenIds: ['node_double_entry_gl']
      },
      node_double_entry_gl: {
        id: 'node_double_entry_gl',
        label: 'Ledger Voucher Committed',
        type: 'ledger_output',
        systemName: 'Double-Entry General Ledger Subsystem',
        status: 'passed',
        metrics: { latencyMs: 4.8, decisionCriteria: 'Dr. Freight ₹50,000 | Dr. ITC ₹4,200 | Cr. Bank ₹54,200' },
        humanExplanation: 'Voucher posted automatically without manual accounting touch.',
        deepInspection: {
          inputTensorOrPayload: 'Dr. Freight & Inward Logistics: ₹50,000 | Dr. CGST/SGST Input: ₹4,200 | Cr. HDFC Bank: ₹54,200',
          internalLogic: 'Sealed with cryptographic hash 0x7b19fa28',
          outputResult: 'VOUCHER COMMITTED'
        }
      }
    }
  }
];
