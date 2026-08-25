# HOL-1345-01 NVIDIA Enterprise RAG 2.3 Blueprint

ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.

## Table of Contents

- [1. Introduction / Overview](#introduction-overview)
- [2. Main Features](#main-features)
- [3. Industry Scenarios](#industry-scenarios)
- [4. Phase 1 - Create Collections](#phase-1-create-collections)
- [5. Phase 2 - Upload Documents & Input Metadata](#phase-2-upload-documents-input-metadata)
- [6. Phase 3 - Query & Verify](#phase-3-query-verify)
- [7. Appendix I: Sample questions that demonstrate the RAG features](#appendix-i-sample-questions-that-demonstrate-the-rag-features)

## Introduction Overview

This lab introduces the NVIDIA Enterprise RAG Blueprint, a reference architecture for building production-grade Retrieval-Augmented Generation applications. Participants will interact with the RAG pipeline; from document ingestion to query retrieval, highlighting how NVIDIA NIM (inference microservices) and NeMo Retriever transform static enterprise data into an interactive knowledge base.

**Goal**

Provide technical staff the experience of configuring and managing a RAG pipeline, demonstrating its ability to ingest, index, and retrieve industry-specific knowledge using NVIDIA’s accelerated infrastructure.

⚠️ **Important:**

- This lab provides some sample datasets for 5 industry verticals; Technology, Healthcare, Energy, Finance (These are pre-loaded) and Manufacturing (Can be ingested).
- Note: The RAG system frontend is for demonstration purposes only, not suitable for production use (Doesn't have full enterprise-grade features)

## Lab Credentials:

**Ubuntu 22.04**

- FQDN: ubuntu-22-04.demo.local
- IP: 192.168.1.100
- Username/Password : demouser / Password123! | root / Password123!

### 1.1 Target Audience

- Dell field technical specialists
- AI Solution architects

### 1.2 Pre-requisite Knowledge

- Knowledge of NVIDIA Enterprise AI Suite
- Understanding of RAG systems (Retrieval Augmented Generation)

[Back to top](#table-of-contents)

---

## Main Features

### Enterprise RAG 2.3 Main Features

- **NVIDIA NIM & NeMo Retriever**: Utilizes GPU-accelerated microservices for state-of-the-art embedding and ranking models (e.g., NV-Embed, NV-Rerank).
- **Hybrid Search**: Combines dense vector search (semantic meaning) with sparse search (keyword matching) for superior retrieval accuracy.
- **Advanced Citations**: Every result is accompanied by the Sources that were used in the answer generation, linked to specific blocks of text, images, tables within the data Collection.
- **Multimodal Ingestion**: Native support for ingesting complex PDFs containing text, tables, and charts, essential for enterprise reporting. Also supports image files, JSON, PPTX, DOCX
- **Enterprise Guardrails**: (Optional) Integration with NeMo Guardrails to ensure model safety and topic adherence during the Q&A phase.

**Enterpise RAG Architecture Diagram:**

![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/arch_diagram.png 'Click to enlarge'){data-modal=true}
[Back to top](#table-of-contents)

---

## Industry Use-cases:

To demonstrate versatility, we have prepared sample datasets across four key industry verticals:

### 🏗️ Technology

- **Data Type**: Product manuals (XE7740), white papers, Dell AI Factory e-books, NVIDIA Enterprise suite guide.
- **Use Case**: An "Engineering Assistant" that can answer complex configuration questions, and summarize deployment best practices.

### ⚡ Energy

- **Data Type**: Renewable energy research reports, Nuclear power whitepapers, Decarbonization whitepaper, WEF Corporate Climate Action plane
- **Use Case**: Quick policy briefs & scenario comparisons, Client‑specific fact‑checking, benchmarking, compliance checklists, Automated ESG reporting.

### 🏥 Healthcare

- **Data Type**: Clinical trial results (GLP-1 family of drugs), Healthcare Standard Operating Procedures (Emergency Triage & Remote-care) .
- **Use Case**: A "Research Aide" for clinicians to rapidly synthesize findings across thousands of medical journals or verify protocol compliance rapidly.

### 💰 Finance

- **Data Type**: 10-K filings, market risk analysis, Fraud Prevention Whitepapers and policy documents.
- **Use Case**: A "Financial Analyst" tool capable of extracting specific fiscal year data from tables in PDFs and comparing risk factors across multiple company reports.

### 🏭 Manufacturing

- **Data Type**: Whitepapers covering impact of physical AI/Robotics on Manufacturing, Manufacturing Sustainability, How Quantum Tech can impact advanced manufacturing and supply chain
- **Use Case**: Plant Engineers researching collaborative robotic solutions for an assembly line, Supply-chain manager planning on leveraging quantum-enhanced optimizations in the future to resolve multi-plant scheduling issues. Clients investigating the ROI on retrofitting their conveyor system with AI-based vision inspection.

[Back to top](#table-of-contents)

---

## Phase 1 - Create Collections

In Enterprise RAG Blueprint v2.3, data is organized into **Collections**. There are 4 Collections pre-created, We will create a separate collection for each industry to demonstrate domain segregation. In the first phase of this lab, we will create a collection for `Manufacturing` vertical, to bring you through the data ingestion process:

1.  **Navigate to Collection Management**:
    - Open the browser, The homepage should open automatically (https://localhost:8090 or click the bookmark on the bookmark bar) From the main dashboard, locate and click the **"New Collection"** button.
      ![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/RAG-UI-Collections.png 'Click to enlarge'){data-modal=true}
2.  **Define Collection Details**:
    - **Name**: Enter a clear identifier, e.g., `Manufacturing`.
3.  **Configure Metadata Schema (Advanced)**:
    - _Note_: Blueprint 2.3 allows defining a metadata schema at the collection level. You can add as many Metadata fields as you wish to the collection to tag your collection appropriately. A common metadata field is `Document_Type` but feel free to add more than one.
      ![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/RAG-UI-Collection-Creation.png 'Click to enlarge'){data-modal=true}

[Back to top](#table-of-contents)

---

## Phase 2 - Upload Documents & Input Metadata

Next, you will ingest the PDFs.

1.  **Initiate Upload**:
    - Click **"Choose Files"** or **"Drag and drop multiple files to the appropriate area of the UI"**.
    - **Select Files**: Drag and drop the sample PDF files relevant to that industry. The files we will upload are located in the following directory: `/mnt/cache/RAG_Files/Manufacturing/`
      ![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/RAG-UI-Collection-Manufacturing.png 'Click to enlarge'){data-modal=true}
      - _Lab Tip_: The UI processes batches of up to **100 files** at a time.
2.  **Input Metadata**:
    - **Manual Entry**: If the UI presents a metadata entry form for the batch (or per file), populate the fields you defined earlier (e.g., `manufacturing_whitepaper`, `industry_4.0`).
3.  **Process**: Click **"Create Collection"**.
    - Monitor the notification area and progress bar. The system is now chunking text, extracting tables, and generating embeddings using the NVIDIA NIM (e.g., `nv-embed-qa-v1`). Depending on how many documents and their size, this can take a minute or two.

[Back to top](#table-of-contents)

---

## Phase 3 - Query & Verify

1.  **Check Status**: Ensure documents are showing when you click the ellipses beside the Collection you just created
    ![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/RAG-UI-Collection-Content.png 'Click to enlarge'){data-modal=true}
2.  **Test the RAG**:
    - Navigate to the **"Chat"** interface (Home).
      ![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/RAG-UI-Collections.png 'Click to enlarge'){data-modal=true}
    - **Select Collection**: Click on any collection you wish to interact with (e.g., `Finance`).
      ![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/RAG-UI-Source-Query.png 'Click to enlarge'){data-modal=true}
    - **Run a Query**: Ask a specific question like _"Can you compare the Q2 and Q3 2025 NVIDIA quarterly results, output into a table, under the table describe any trends that are evident."_
    - **Verify Citations**: The RAG system provides a summarized answer as well as a **Sources button** Point out to users how the answer cites the specific PDF source (Provides up to 10 sources), proving the response is grounded in the uploaded data., Click on any of the citations to expand where exactly in the doc (text, tables) the data was sourced.
      ![Image](/ImageProxy?filename=34433ee9-ab2e-4913-a39d-eb3c00ef29d4/RAG-UI-Citations.png 'Click to enlarge'){data-modal=true}

[Back to top](#table-of-contents)

---

#

## Appendix I: Sample questions that can demonstrate the RAG features:

Please feel free to query the RAG system with your own questions, or below are some suggestions based on the uploaded Collections:

🏥 **Healthcare**:

- _"Can you highlight any dangers or areas for concern in the GLP-1 drug trials results_"
- _"From reviewing the results of the trials for GLP-1 drugs, are there any specific cohorts of patients that should avoid these drugs, and why?_"
- _"In the Standard Operating Procedure for Telehealth, What are the Inclusion and Exclusion Criteria for patient suitability for Telehealth? Can you provide some examples of each_"
- _"List the most popular features of Telehealth that are provided by personal doctors? - Check the sources, this response was sourced from an infographic)_"

💰 **Finance**:

- _"Can you compare the Q2 and Q3 2025 NVIDIA quarterly results, output into a table, and also provide some analysis of any trends that are evident._"
- _"Based on the quarterly results provided, where should NVIDIA focus on for maximum growth in future quarters?_"
- _"How can technology providers help corporates prevent payment fraud - can you provide 3 actionable items?_"

🏗️ **Technology**:

- _"Can you provide the key components of the Dell AI factory, and a decription of each's function._"
- _"Can you provide a summary of the key features of a PowerEdge XE7740 server?_"
- _"Whats the highest wattage GPU that a PowerEdge XE7740 supports, and how many of these GPU's cna be added per server?_"
- _"What functions does the control panel provide on a PowerEdge XE7740_"

⚡ **Energy**:

- _"Can you describe with examples, How digital transformation impacts value chains in the oil and gas industry?_"
- _"How does Industry 4.0 transform upstream exploration for oil and gas? Can you provide details on this_"

🏭 **Manufacturing**:

- _"Please describe in detail, what are the Quantum technologies driving the next industrial leap, and how they impact the manufacturing industry_"
- _"Can you describe the emerging physical-AI technology stack that is required to enable advanced robotics in manufacturing?_"
- _"How do digital upskillingprogrammes benefit both employees and employers in the workforce of the future_"

---

⚠️ **Note on Prompt responses**:

- Customers may want more-verbose or less-verbose responses from the RAG, this is entirely configurable by editing the system prompt config file: `home/demouser/projects/rag/src/nvidia_rag/rag_server/prompt.yaml`

---

[Back to top](#table-of-contents)

---
