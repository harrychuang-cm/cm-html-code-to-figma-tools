## ADDED Requirements

### Requirement: Select multiple breakpoint widths for capture
The system SHALL let a designer select one or more breakpoint widths to capture from the Chrome Extension, offering preset widths of 1440, 1024, 768, and 375 pixels as multi-selectable options. The system SHALL allow a designer to add a custom width by entering a positive integer, SHALL reject non-positive or non-integer custom widths without adding them, and SHALL de-duplicate identical widths. The system SHALL require at least one breakpoint to be selected before capture can start.

#### Scenario: Select multiple preset breakpoints
- **WHEN** a designer checks the 1440, 768, and 375 preset breakpoints and starts capture
- **THEN** the system captures the active tab at each selected breakpoint width

#### Scenario: Add a valid custom width
- **WHEN** a designer enters a custom width of 1280 and adds it
- **THEN** the system includes 1280 in the list of breakpoints to capture

#### Scenario: Reject an invalid custom width
- **WHEN** a designer enters a custom width that is not a positive integer
- **THEN** the system reports the input as invalid and does not add it to the breakpoint list

#### Scenario: De-duplicate repeated widths
- **WHEN** a designer adds a custom width equal to an already-selected preset width
- **THEN** the system keeps a single breakpoint entry for that width

#### Scenario: Require at least one breakpoint
- **WHEN** no breakpoint is selected
- **THEN** the system prevents capture and indicates that at least one breakpoint must be selected

### Requirement: Capture each breakpoint with device emulation
The system SHALL capture each selected breakpoint by applying device-metrics emulation to the active tab so that the captured viewport width matches the breakpoint width precisely. The system SHALL capture the selected breakpoints sequentially. After capturing all breakpoints, including on failure, the system SHALL clear any emulation override and detach so the tab is restored to its original state. When an individual breakpoint capture fails, the system SHALL record that breakpoint as failed and continue capturing the remaining breakpoints, producing a package as long as at least one breakpoint succeeds.

#### Scenario: Capture a narrow mobile breakpoint precisely
- **WHEN** a designer captures the 375 breakpoint
- **THEN** the system emulates a 375-pixel viewport width and the captured viewport width is 375 pixels

#### Scenario: Restore the tab after capture
- **WHEN** the system finishes capturing all selected breakpoints
- **THEN** the system clears the emulation override and detaches, restoring the tab to its original viewport

#### Scenario: Continue after a single breakpoint failure
- **WHEN** capturing one breakpoint fails but other breakpoints succeed
- **THEN** the system records the failed breakpoint, continues with the remaining breakpoints, and produces a package containing the successful breakpoints

#### Scenario: Detach when emulation cannot be attached
- **WHEN** device-metrics emulation cannot be attached to the tab
- **THEN** the system reports a runtime error and ensures the tab is not left in an emulated state

### Requirement: Package multiple breakpoints in a single capture file
The system SHALL package all successfully captured breakpoints into a single `.figcapture` file, where each breakpoint entry retains its own width, captured DOM, screenshot, diagnostics, and Figma plan. The system SHALL remain able to read a legacy single-capture `.figcapture` package by treating it as a single breakpoint.

#### Scenario: Download one file for multiple breakpoints
- **WHEN** a designer confirms export after capturing three breakpoints
- **THEN** the system downloads a single `.figcapture` file containing all three breakpoint entries

#### Scenario: Read a legacy single-capture package
- **WHEN** a legacy `.figcapture` package without a breakpoint array is read
- **THEN** the system treats it as a single breakpoint and processes it without error

### Requirement: Import breakpoints as side-by-side frames
The system SHALL import a multi-breakpoint `.figcapture` package by creating one frame per breakpoint on the same Figma page, arranged horizontally side by side ordered from the widest breakpoint to the narrowest, left to right. The system SHALL name each frame with its breakpoint width.

#### Scenario: Create side-by-side frames for each breakpoint
- **WHEN** a designer imports a package containing the 1440, 768, and 375 breakpoints
- **THEN** the system creates three frames on the same page arranged left to right as 1440, 768, 375, each named with its breakpoint width

#### Scenario: Frames do not overlap
- **WHEN** the system lays out the breakpoint frames horizontally
- **THEN** each frame is offset by the previous frame width plus a fixed gap so the frames do not overlap
