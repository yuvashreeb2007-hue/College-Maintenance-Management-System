## 1. Purpose and Scope

### Purpose

The purpose of the College Maintenance Management System is to provide a simple system for students and maintenance staff to manage college maintenance complaints. The system will support login, complaint submission, complaint tracking, complaint management, maintenance categories, and basic reports.

### In Scope

* Student and maintenance staff login.
* Submission and tracking of maintenance complaints.
* Staff assignment, updating, and resolution of complaints.
* Categorization of maintenance complaints.
* Reports on pending, ongoing, and resolved complaints.

### Out of Scope

* Online payment or billing.
* Mobile application.
* Automated maintenance scheduling.
* Integration with external systems.
* Advanced analytics or prediction.

---

## 2. Functional Requirements

**FR-01:** The system shall allow students and maintenance staff to log in securely.

**FR-02:** The system shall allow students to submit maintenance complaints.

**FR-03:** The system shall allow students to view the status of their submitted complaints.

**FR-04:** The system shall allow maintenance staff to view, assign, update, and resolve complaints.

**FR-05:** The system shall organize maintenance complaints into categories such as electrical, plumbing, and cleaning.

**FR-06:** The system shall generate reports showing pending, ongoing, and resolved complaints.

---

## 3. Non-Functional Requirements

**NFR-01:** The system shall respond to normal user actions within **3 seconds**.

**NFR-02:** The system shall allow only authenticated users to access protected system functions.

**NFR-03:** The system shall provide a usable interface that allows a user to complete a complaint submission within **5 minutes**.

**NFR-04:** The system shall maintain complaint data with at least **99% data consistency** during normal operation.

**NFR-05:** The system shall support at least **20 simultaneous users** during normal operation.

**NFR-06:** The system shall successfully process at least **95% of valid user requests** without system failure.

---

## 4. Assumptions

* Users will have valid login credentials.
* Students will submit accurate complaint information.
* Maintenance staff will update complaint statuses correctly.
* The system will use SQLite as its database.
* The system will be developed using Python.

## 5. Constraints

* The project will use **Python** for development.
* The project will use **SQLite** for data storage.
* The first version will be developed as a small college project.
* The system will depend on a local computer environment for operation.
* Development time and resources will be limited.
