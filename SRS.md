## Purpose and Scope

**Purpose:**
The purpose of the College Management System is to provide a simple system for managing student registration, student records, attendance, marks, grades, and student reports.

**In Scope:**

* Student registration and login.
* Adding, editing, and deleting student details.
* Searching and viewing student records.
* Managing student attendance.
* Managing student marks and grades.
* Generating simple student reports.

**Out of Scope:**

* Faculty management.
* Course or subject scheduling.
* Fee and payment management.
* Library management.
* Hostel management.
* Examination scheduling.

## Functional Requirements

* **FR-01:** The system shall allow students to register and log in.
* **FR-02:** The system shall allow authorized users to add, edit, and delete student details.
* **FR-03:** The system shall allow users to search for and view student records.
* **FR-04:** The system shall allow users to record and manage student attendance.
* **FR-05:** The system shall allow users to record student marks and grades.
* **FR-06:** The system shall generate simple reports containing student information, attendance, marks, and grades.

## Non-Functional Requirements

* **NFR-01:** The system shall display normal page or record operations within **2 seconds** under normal local usage.
* **NFR-02:** The system shall store user passwords using a secure hashing method with **at least 256-bit security**.
* **NFR-03:** The system shall allow a new user to complete registration or login within **3 minutes** without assistance.
* **NFR-04:** The system shall maintain at least **99% reliability** during normal project testing.
* **NFR-05:** The system shall provide clear error messages for **100% of invalid form submissions**.
* **NFR-06:** The system shall prevent unauthorized users from accessing protected student data in **100% of access-control tests**.

## Assumptions

* Users have access to a computer with Python installed.
* The system will be used by a limited number of college users.
* SQLite will be sufficient for the expected project data.
* Users will provide accurate student, attendance, marks, and grade information.

## Constraints

* The system shall be developed using **Python**.
* The database shall use **SQLite**.
* The first version shall be developed within **a few weeks**.
* The system shall remain limited to the **six specified features**.
