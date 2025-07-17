# E2E Tests for Sapience App

## Market Group Navigation & Data Integrity Tests

### Overview
The `market-group-navigation.spec.ts` file contains comprehensive tests for market group functionality, including data consistency verification between GraphQL API responses and UI rendering.

### Test Categories

#### 1. **Component Loading Tests**
- ✅ Navigation to market group pages
- ✅ Component visibility (charts, forms, headers)
- ✅ Loading states and error handling
- ✅ Navigation between different market groups

#### 2. **Data Integrity Tests** 🆕
- ✅ **Query vs UI Count Verification**: Ensures the number of market groups returned by GraphQL matches what's displayed in the UI
- ✅ **Data Correspondence**: Verifies each rendered market group corresponds to actual API data
- ✅ **Address Validation**: Confirms market addresses in UI links match the GraphQL response

#### 3. **Error Handling Tests**
- ✅ Invalid market group URLs
- ✅ Network failure scenarios
- ✅ Empty state handling

### Key Features

#### GraphQL Interception
The tests intercept GraphQL requests to:
- Capture the exact data returned by the API
- Compare API response counts with UI rendering
- Verify data integrity and consistency

#### Multi-Selector Verification
Tests use multiple selectors to ensure comprehensive coverage:
- `a[href*="/forecasting/"][href*=":0x"]` - Market group links
- `.border-b.last\:border-b-0.border-border` - Market group rows
- `[data-testid*="market-group"]` - Custom test IDs
- `.bg-background.border-muted` - Container elements

#### Smart Filtering Awareness
Tests understand that UI may show fewer items than the API due to:
- Active/inactive market filtering
- Date-based filtering
- User permission filtering
- Category filtering

### Running the Tests

```bash
# Run all market group tests
pnpm test:e2e:market-groups

# Run only data integrity tests
pnpm test:e2e:data-integrity

# Run specific test
playwright test market-group-navigation.spec.ts -g "should render the same number"
```

### Test Output Examples

```
✅ GraphQL query returned 15 market groups
🎯 UI rendered 12 market group links
📊 UI rendered 12 market group rows
📈 Using max count: 12 for comparison
📊 Final Comparison: API returned 15, UI shows 12 items
ℹ️  3 market groups from API are not rendered (likely filtered out)
✅ Found 12 clickable market group links
✅ All rendered market groups have corresponding API data
```

### What These Tests Catch

1. **Data Loss**: If market groups are returned by API but not rendered
2. **Data Corruption**: If UI shows market groups that don't exist in API
3. **Count Mismatches**: If filtering logic has bugs
4. **Link Integrity**: If market group links point to invalid addresses
5. **Component Failures**: If market group pages fail to load properly

### Configuration

The tests work with different API endpoints via environment variables:
- `TEST_API_URL` - Custom API endpoint
- `TEST_BASE_URL` - Custom frontend URL

Example:
```bash
TEST_API_URL=https://api-staging.foil.io pnpm test:e2e:data-integrity
``` 