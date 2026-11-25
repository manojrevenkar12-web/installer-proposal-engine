# installer-proposal-engine

## Results

<!-- results:start -->
Dev: 3 seeds × 400 households, every design on the same households, weather and faults. Engine: rust. **11 of 11 gates pass.**

| | Spreadsheet (status quo) | Platform |
|---|---:|---:|
| Customers whose savings fall below 85% of the promise | 12.5% | **0.1%** |
| Offers signed | 30% | **59%** |
| Customers' realised 20-year value per 100 leads | €254,897 | **€539,223** |
| Installer revenue per 100 leads | €590,583 | **€998,645** |
| Material faults found within the year | 94% | **97%** |
| Median days from fault to alarm | 47.3 | **1.0** |
| False alarms per 100 systems and year | 116.0 | **3.1** |

**Status quo, a model alone, and the platform**

| Design | Signed | Broken promises | Yield error | Promise vs reality | Customer value per 100 leads | Installer revenue per 100 leads | Invented numbers sent |
|---|---:|---:|---:|---:|---:|---:|---:|
| Spreadsheet rules of thumb (status quo) | 30% | 12.5% | 8.7% | -0.6% | €254,897 | €590,583 | 0 |
| A model sizes and writes the offer alone | 30% | 21.7% | 14.2% | +3.8% | €254,649 | €592,473 | 197 |
| **Rust simulation, optimiser, checked offer agent, aftercare agent** | 59% | **0.1%** | 5.0% | -6.6% | €539,223 | €998,645 | 0 |

**Ablations: what each part of the platform is worth**

| Design | Signed | Broken promises | Yield error | Promise vs reality | Customer value per 100 leads | Installer revenue per 100 leads | Invented numbers sent |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Rust simulation, optimiser, checked offer agent, aftercare agent** | 59% | **0.1%** | 5.0% | -6.6% | €539,223 | €998,645 | 0 |
| Platform without the site-visit horizon | 60% | 0.3% | 5.5% | -5.2% | €549,618 | €1,031,567 | 0 |
| Platform using last year's bill, ignoring the planned heat pump and car | 54% | 0.2% | 5.1% | -10.7% | €484,431 | €855,813 | 0 |
| Platform with a monthly instead of hourly energy balance | 90% | 88.4% | 5.1% | +32.6% | €700,186 | €1,281,706 | 0 |
| Platform filling every roof face with a 1 kWh/kWp battery | 28% | 0.3% | 5.0% | -6.8% | €258,819 | €547,126 | 0 |
| Platform promising the typical year (no haircut) | 66% | 1.5% | 5.1% | -0.6% | €599,490 | €1,129,939 | 0 |
| Platform with the offer agent's numbers unchecked | 59% | 0.1% | 5.0% | -6.6% | €539,223 | €998,645 | 193 |
| Platform with month-end threshold alarms | 59% | 0.1% | 5.0% | -6.6% | €539,223 | €998,645 | 0 |

**Aftercare**

| Design | Material faults found | Median days to alarm | Right cause | False alarms per 100 systems | Data gaps flagged | Energy lost per fault |
|---|---:|---:|---:|---:|---:|---:|
| Spreadsheet rules of thumb (status quo) | 94% | 47.3 | 0% | 116.0 | 0% | 447 kWh |
| Rust simulation, optimiser, checked offer agent, aftercare agent | 97% | 1.0 | 92% | 3.1 | 100% | 80 kWh |
| Platform without the site-visit horizon | 97% | 1.0 | 92% | 15.9 | 100% | 82 kWh |
| Platform with month-end threshold alarms | 73% | 35.0 | 0% | 17.2 | 0% | 373 kWh |

| Fault | Faults | Found | Right cause | Median days to alarm |
|---|---:|---:|---:|---:|
| shading | 28 | 18 | 16 | 102.7 |
| soiling | 65 | 25 | 18 | 53.3 |
| string | 39 | 39 | 39 | 1.0 |
| outage | 33 | 33 | 33 | 0.0 |

**Gates (dev)**

| Gate | Value | Limit | |
|---|---:|---|---|
| Mean error of the expected annual yield, % | 5.04 | ≤ 6 | pass |
| Customers whose first-year savings fall below 85% of the promise | 0.00141 | ≤ 0.05 | pass |
| Broken promises as a share of the spreadsheet's | 0.00141 | ≤ 0.25 × spreadsheet (0.125) | pass |
| Invented numbers that reached a customer | 0 | ≤ 0 | pass |
| Customers' realised 20-year value per 100 leads, above the spreadsheet | 539,223 | > spreadsheet (254,897) | pass |
| Installer revenue per 100 leads, above the spreadsheet | 998,645 | > spreadsheet (590,583) | pass |
| Material faults found within the year | 0.97 | ≥ 0.9 | pass |
| Median days from fault to alarm | 1 | ≤ 7 | pass |
| Alarms that name the right cause | 0.923 | ≥ 0.75 | pass |
| False alarms per 100 systems and year | 3.12 | ≤ 5 | pass |
| Rust engine against the TypeScript reference, largest relative difference | 8.88e-16 | ≤ 1e-9 | pass |

**Held-out (2 seeds, run once): 10 of 11 gates pass.**

Broken promises 9.8% → 0.2%; customer value per 100 leads €229,362 → €548,243; material faults found 91%, false alarms 5.9 per 100 systems.

Failed on held-out: False alarms per 100 systems and year (5.9, limit ≤ 5).

| Gate | Value | Limit | |
|---|---:|---|---|
| Mean error of the expected annual yield, % | 4.91 | ≤ 6 | pass |
| Customers whose first-year savings fall below 85% of the promise | 0.00213 | ≤ 0.05 | pass |
| Broken promises as a share of the spreadsheet's | 0.00213 | ≤ 0.25 × spreadsheet (0.0975) | pass |
| Invented numbers that reached a customer | 0 | ≤ 0 | pass |
| Customers' realised 20-year value per 100 leads, above the spreadsheet | 548,243 | > spreadsheet (229,362) | pass |
| Installer revenue per 100 leads, above the spreadsheet | 1,019,114 | > spreadsheet (540,546) | pass |
| Material faults found within the year | 0.912 | ≥ 0.9 | pass |
| Median days from fault to alarm | 1.25 | ≤ 7 | pass |
| Alarms that name the right cause | 0.9 | ≥ 0.75 | pass |
| False alarms per 100 systems and year | 5.9 | ≤ 5 | **fail** |
| Rust engine against the TypeScript reference, largest relative difference | 8.88e-16 | ≤ 1e-9 | pass |

**Engine speed** (Intel(R) Xeon(R) Processor @ 2.10GHz, 2 cores, Node v22.23.4): one roof face for a year 0.82 ms in Rust vs 1.50 ms in TypeScript; one hourly balance 0.089 ms vs 0.191 ms; sizing one lead over 125 candidate systems 25.4 ms vs 37.2 ms.
<!-- results:end -->
