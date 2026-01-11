# UML Diagram Library for Invoice Processing System

This directory contains comprehensive UML diagrams documenting the Invoice Processing System's architecture, designed for use in Figma and other design tools.

## 📁 Diagram Collection

### 1. System Architecture Overview
**File:** `01-system-architecture.svg`
- High-level system components and their relationships
- Data flow between frontend, backend services, and external APIs
- Organization-aware multi-tenant architecture overview
- Real-time data synchronization patterns

### 2. Upload & Processing Sequence
**File:** `02-sequence-upload-processing.svg`  
- Detailed sequence diagram of the invoice upload and processing workflow
- Shows interaction between user, frontend, backend services, and external APIs
- Includes organization context handling and error scenarios
- Demonstrates async processing with Cloud Tasks

### 3. Class Diagram
**File:** `03-class-diagram.svg`
- Object-oriented design structure of all major classes
- Service relationships and dependencies
- Data models and their attributes
- Organization-aware architecture implementation details

### 4. Database Schema (Firestore)
**File:** `04-database-schema.svg`
- Complete Firestore collection structure
- Organization-level vs user-level data isolation
- Composite indexes and query optimization
- Multi-tenant data routing logic

### 5. Deployment Architecture
**File:** `05-deployment-architecture.svg`
- Production deployment on Google Cloud Platform
- Container orchestration with Cloud Run
- Network topology and security layers
- Monitoring and observability components

### 6. Component Diagram
**File:** `06-component-diagram.svg`
- Modular component breakdown by functional layers
- Service boundaries and interfaces
- Frontend/backend component relationships
- External service integrations

## 🎨 Figma Integration Guide

### Importing SVG Diagrams
1. **Direct Import**: Copy and paste SVG content directly into Figma
2. **File Upload**: Save SVGs locally and drag into Figma canvas
3. **Component Creation**: Convert imported diagrams to Figma components for reuse

### Editing and Customization
- **Color Schemes**: All diagrams use consistent color coding for different component types
- **Text Editing**: Text elements can be edited directly in Figma after import
- **Scaling**: Vector-based SVGs maintain quality at any zoom level
- **Layer Organization**: Each diagram is structured with logical groupings

### Color Legend
- **Blue (#4285f4)**: Core application services
- **Green (#34a853)**: Database and storage components  
- **Purple (#8e24aa)**: External services and APIs
- **Orange (#f57c00)**: User interface components
- **Red (#d93025)**: Queue and messaging systems
- **Teal (#00695c)**: Storage and file systems

## 🔧 Technical Documentation

### Architecture Highlights
- **Multi-Tenant Design**: Organization-aware data isolation with smart collection routing
- **Real-Time Sync**: Firestore listeners with automatic fallback mechanisms
- **Async Processing**: Cloud Tasks for reliable invoice processing pipeline
- **Microservices**: Containerized services (initial-api, queue-processor, archive-manager)
- **Modern Frontend**: React SPA with TypeScript and real-time state management

### Key Workflows Documented
1. **File Upload Flow**: User uploads → GCS storage → Cloud Tasks queue → AI processing
2. **Organization Management**: Multi-tenant data access with role-based permissions
3. **Real-Time Updates**: Firestore listeners → Frontend state sync → UI updates
4. **Data Lifecycle**: Active processing → Results storage → Archival → CSV export

### Service Dependencies
- **Frontend**: React app hosted on Netlify with Firebase Auth integration
- **Backend**: Python services on Google Cloud Run with Docker containers
- **Database**: Cloud Firestore with composite indexes for multi-tenant queries
- **AI Processing**: OpenAI GPT-4 Vision API for invoice data extraction
- **Queue System**: Google Cloud Tasks for reliable async processing

## 📋 Usage Instructions

### For Developers
- Use these diagrams to understand system architecture before making changes
- Reference sequence diagrams when debugging cross-service issues
- Consult database schema when designing new features requiring data storage

### For Product Managers
- System overview diagram provides high-level understanding for stakeholder communication
- Deployment architecture shows infrastructure costs and scaling considerations
- Component diagram helps understand feature boundaries and development effort

### For DevOps/Infrastructure
- Deployment architecture diagram shows complete infrastructure setup
- Component diagram identifies service boundaries for monitoring and alerting
- Database schema shows indexing requirements for performance optimization

## 🔄 Maintenance

### Updating Diagrams
When system architecture changes, update corresponding diagrams:

1. **Code Changes**: Update class and component diagrams
2. **Database Schema**: Update database schema diagram and index requirements  
3. **Infrastructure**: Update deployment architecture for new services
4. **Workflows**: Update sequence diagrams for new user flows

### Version Control
- All diagrams are stored as SVG files for version control compatibility
- Changes tracked in git alongside code changes
- Diagram updates should accompany related feature development

## 🚀 Quick Start for Design Reviews

1. **Import** `01-system-architecture.svg` into Figma for system overview
2. **Reference** specific diagrams based on the component or workflow being discussed
3. **Annotate** diagrams directly in Figma during design reviews
4. **Share** Figma links with development team for implementation alignment

---

*Generated for Invoice Processing System - Multi-tenant organization-aware architecture*
*Last updated: Compatible with current system implementation*