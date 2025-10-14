# Leaderboard Separation by Organization Category

## Overview
Enhanced the leaderboard system to provide separate rankings for **Co-Curricular Organizations** and **Extra-Curricular Organizations**. This allows for fair comparison within each category and better analytics.

---

## Database Changes

### 1. New Stored Procedure

**Procedure:** `GetOrganizationsEventStatisticsByCategory`

**Purpose:** Returns TWO result sets - one for Co-Curricular organizations and one for Extra-Curricular organizations

**Returns:** 
- **Result Set 1:** Co-Curricular Organizations Leaderboard
- **Result Set 2:** Extra-Curricular Organizations Leaderboard

**Fields in Each Result Set:**
```sql
- category VARCHAR           -- 'Co-Curricular' or 'Extra-Curricular'
- rank_position INT          -- Rank within category (1, 2, 3...)
- organization_id INT        -- NEW: Organization ID for navigation
- organization_name VARCHAR  -- Organization name
- organization_version_id INT -- NEW: For URL construction
- cycle_number INT          -- Current cycle
- total_events_held INT     -- Total approved events
- average_attendance DECIMAL -- Average attendance per event
- total_participants INT    -- Total unique participants
- participation_trend_status VARCHAR -- 'Growing', 'Declining', 'Stable', 'Insufficient Data'
- participation_trend JSON  -- Array of {eventName, participants}
```

**Logic:**
- Filters organizations by `o.category = 'Co-Curricular Organization'` for first result set
- Filters organizations by `o.category = 'Extra Curricular Organization'` for second result set
- Each result set independently calculates rankings using `RANK() OVER (ORDER BY average_attendance DESC)`
- Uses latest cycle for each organization
- Only includes 'Approved' organizations and events
- Participation trends calculated from earliest to latest events

### 2. Enhanced Stored Procedure

**Procedure:** `GetAllOrganizationsEventStatistics` (Updated)

**Changes:**
- Added `organization_id` field to result
- Added `category` field to result
- Renamed `current_org_version_id` to `organization_version_id` for consistency

**New Fields:**
```sql
organization_id INT,           -- NEW: For navigation
category VARCHAR,              -- NEW: 'Co-Curricular Organization' or 'Extra Curricular Organization'
organization_version_id INT,   -- RENAMED from current_org_version_id
```

---

## API Implementation

### 1. Node.js Model

**File:** `node-app/web/models/analyticsModel.js`

**New Function:**
```javascript
async function getLeaderboardsByCategory() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationsEventStatisticsByCategory()');
        return {
            coCurricular: rows[0] || [],
            extraCurricular: rows[1] || []
        };
    } catch (error) {
        console.error('Error fetching leaderboards by category:', error);
        throw error;
    } finally {
        connection.release();
    }
}
```

**Return Format:**
```javascript
{
    coCurricular: [
        {
            category: 'Co-Curricular',
            rank_position: 1,
            organization_id: 5,
            organization_name: 'Computer Society',
            organization_version_id: 10,
            cycle_number: 1,
            total_events_held: 12,
            average_attendance: 85.50,
            total_participants: 450,
            participation_trend_status: 'Growing',
            participation_trend: '[{"eventName":"Tech Talk","participants":95}]'
        },
        // ... more co-curricular orgs
    ],
    extraCurricular: [
        {
            category: 'Extra-Curricular',
            rank_position: 1,
            organization_id: 8,
            organization_name: 'Dance Troupe',
            organization_version_id: 15,
            cycle_number: 1,
            total_events_held: 8,
            average_attendance: 120.75,
            total_participants: 350,
            participation_trend_status: 'Stable',
            participation_trend: '[{"eventName":"Annual Recital","participants":150}]'
        },
        // ... more extra-curricular orgs
    ]
}
```

### 2. Node.js Controller

**File:** `node-app/web/controllers/analyticsController.js`

**New Function:**
```javascript
async function getLeaderboardsByCategory(req, res) {
    const { sessionId } = req.query;
    try {
        const leaderboards = await analyticsModel.getLeaderboardsByCategory();
        if (sessionId) {
            subscribeToChannel(sessionId, "leaderboards_by_category");
        }
        res.status(200).json(leaderboards);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the leaderboards by category.",
        });
    }
}
```

### 3. Route

**File:** `node-app/web/routes/analytics.js`

**New Route:**
```javascript
router.get('/analytics/leaderboards-by-category', 
    middleware.validateAzureJWT, 
    analyticsController.getLeaderboardsByCategory
);
```

---

## API Usage

### New Endpoint

```
GET /analytics/leaderboards-by-category
```

**Authentication:** Required (Azure JWT)

**Query Parameters:**
- `sessionId` (optional) - For real-time SSE subscriptions

**Example Request:**
```bash
curl -X GET \
  'https://your-api.com/analytics/leaderboards-by-category?sessionId=abc123' \
  -H 'Authorization: Bearer <JWT_TOKEN>'
```

**Response:**
```json
{
  "coCurricular": [
    {
      "category": "Co-Curricular",
      "rank_position": 1,
      "organization_id": 5,
      "organization_name": "Computer Society",
      "organization_version_id": 10,
      "cycle_number": 1,
      "total_events_held": 12,
      "average_attendance": "85.50",
      "total_participants": 450,
      "participation_trend_status": "Growing",
      "participation_trend": "[{\"eventName\":\"Tech Talk\",\"participants\":95},{\"eventName\":\"Hackathon\",\"participants\":120}]"
    },
    {
      "category": "Co-Curricular",
      "rank_position": 2,
      "organization_name": "Engineering Society",
      "organization_id": 3,
      "organization_version_id": 8,
      "cycle_number": 1,
      "total_events_held": 10,
      "average_attendance": "75.20",
      "total_participants": 380,
      "participation_trend_status": "Stable",
      "participation_trend": "[...]"
    }
  ],
  "extraCurricular": [
    {
      "category": "Extra-Curricular",
      "rank_position": 1,
      "organization_id": 8,
      "organization_name": "Dance Troupe",
      "organization_version_id": 15,
      "cycle_number": 1,
      "total_events_held": 8,
      "average_attendance": "120.75",
      "total_participants": 350,
      "participation_trend_status": "Stable",
      "participation_trend": "[...]"
    },
    {
      "category": "Extra-Curricular",
      "rank_position": 2,
      "organization_name": "Music Club",
      "organization_id": 12,
      "organization_version_id": 20,
      "cycle_number": 1,
      "total_events_held": 15,
      "average_attendance": "95.40",
      "total_participants": 420,
      "participation_trend_status": "Growing",
      "participation_trend": "[...]"
    }
  ]
}
```

### Existing Endpoint (Updated)

```
GET /analytics/leaderboards
```

Now returns additional fields: `organization_id`, `category`, `organization_version_id`

---

## Frontend Integration

### React Component Usage

```jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Leaderboard() {
    const [coCurricularData, setCoCurricularData] = useState([]);
    const [extraCurricularData, setExtraCurricularData] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetchLeaderboards();
    }, []);

    const fetchLeaderboards = async () => {
        try {
            const response = await fetch('/analytics/leaderboards-by-category', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            
            setCoCurricularData(data.coCurricular || []);
            setExtraCurricularData(data.extraCurricular || []);
        } catch (error) {
            console.error('Error fetching leaderboards:', error);
        }
    };

    const handleViewOrg = (org) => {
        navigate(`/organizations/org-details/${org.organization_id}/${org.organization_version_id}/${encodeURIComponent(org.organization_name)}`);
    };

    // Calculate analytics for Co-Curricular
    const coCurricularAnalytics = useMemo(() => calculateAnalytics(coCurricularData), [coCurricularData]);
    
    // Calculate analytics for Extra-Curricular
    const extraCurricularAnalytics = useMemo(() => calculateAnalytics(extraCurricularData), [extraCurricularData]);

    const calculateAnalytics = (dataset) => {
        if (!dataset || dataset.length === 0) return null;

        const totalOrgs = dataset.length;
        const totalEvents = dataset.reduce((sum, org) => sum + (org.total_events_held || 0), 0);
        const totalParticipants = dataset.reduce((sum, org) => sum + (org.total_participants || 0), 0);
        const avgAttendance = dataset.reduce((sum, org) => sum + (parseFloat(org.average_attendance) || 0), 0) / totalOrgs;
        
        const trendStats = dataset.reduce((acc, org) => {
            const status = org.participation_trend_status?.toLowerCase();
            if (status === 'growing' || status === 'increasing') acc.increasing++;
            else if (status === 'declining' || status === 'decreasing') acc.decreasing++;
            else acc.stable++;
            return acc;
        }, { increasing: 0, decreasing: 0, stable: 0 });

        const topPerformer = dataset[0];
        const mostActive = dataset.reduce((max, org) => 
            (org.total_events_held || 0) > (max.total_events_held || 0) ? org : max, dataset[0]);

        return {
            totalOrgs,
            totalEvents,
            totalParticipants,
            avgAttendance,
            trendStats,
            topPerformer,
            mostActive
        };
    };

    return (
        <div>
            <section>
                <h2>Co-Curricular Organizations</h2>
                {coCurricularAnalytics && (
                    <div className="analytics">
                        <p>Total: {coCurricularAnalytics.totalOrgs}</p>
                        <p>Events: {coCurricularAnalytics.totalEvents}</p>
                        <p>Avg Attendance: {coCurricularAnalytics.avgAttendance.toFixed(1)}</p>
                    </div>
                )}
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Organization</th>
                            <th>Events</th>
                            <th>Avg Attendance</th>
                            <th>Total Participants</th>
                            <th>Trend</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {coCurricularData.map(org => (
                            <tr key={org.organization_id}>
                                <td>#{org.rank_position}</td>
                                <td>{org.organization_name}</td>
                                <td>{org.total_events_held}</td>
                                <td>{org.average_attendance}</td>
                                <td>{org.total_participants}</td>
                                <td>{org.participation_trend_status}</td>
                                <td>
                                    <button onClick={() => handleViewOrg(org)}>
                                        View Details
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section>
                <h2>Extra-Curricular Organizations</h2>
                {extraCurricularAnalytics && (
                    <div className="analytics">
                        <p>Total: {extraCurricularAnalytics.totalOrgs}</p>
                        <p>Events: {extraCurricularAnalytics.totalEvents}</p>
                        <p>Avg Attendance: {extraCurricularAnalytics.avgAttendance.toFixed(1)}</p>
                    </div>
                )}
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Organization</th>
                            <th>Events</th>
                            <th>Avg Attendance</th>
                            <th>Total Participants</th>
                            <th>Trend</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {extraCurricularData.map(org => (
                            <tr key={org.organization_id}>
                                <td>#{org.rank_position}</td>
                                <td>{org.organization_name}</td>
                                <td>{org.total_events_held}</td>
                                <td>{org.average_attendance}</td>
                                <td>{org.total_participants}</td>
                                <td>{org.participation_trend_status}</td>
                                <td>
                                    <button onClick={() => handleViewOrg(org)}>
                                        View Details
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
```

---

## Benefits

### 1. **Fair Competition**
- Co-Curricular and Extra-Curricular organizations compete within their own categories
- Rankings are more meaningful and relevant

### 2. **Better Analytics**
- Separate metrics for each category
- Category-specific insights and trends
- Identify top performers in each type

### 3. **Improved Navigation**
- Direct links to organization detail pages
- No need to search for organization IDs manually

### 4. **Backward Compatibility**
- Original `/analytics/leaderboards` endpoint still works
- Now includes additional fields (`organization_id`, `category`, `organization_version_id`)
- Existing clients continue to function

---

## Migration Notes

### Deployment Steps

1. **Database:**
   - New procedure `GetOrganizationsEventStatisticsByCategory` will be created automatically
   - Existing procedure `GetAllOrganizationsEventStatistics` updated with new fields
   
2. **Backend:**
   - Deploy updated Node.js code
   - Restart server

3. **Frontend (Optional):**
   - Update to use new `/analytics/leaderboards-by-category` endpoint
   - Implement separate sections for each category
   - Use `organization_id` and `organization_version_id` for navigation

### Testing Checklist

**Database Level:**
- [ ] GetOrganizationsEventStatisticsByCategory returns two result sets
- [ ] First result set contains only Co-Curricular organizations
- [ ] Second result set contains only Extra-Curricular organizations
- [ ] Rankings are independent within each category
- [ ] GetAllOrganizationsEventStatistics includes new fields
- [ ] organization_id and organization_version_id populated correctly

**API Level:**
- [ ] GET /analytics/leaderboards-by-category requires authentication
- [ ] Response contains coCurricular and extraCurricular arrays
- [ ] Both arrays have correct structure
- [ ] GET /analytics/leaderboards still works with new fields

**Frontend Level:**
- [ ] Can fetch separate leaderboards
- [ ] Analytics calculated correctly for each category
- [ ] Navigation to org details works with organization_id
- [ ] Both sections display correctly
- [ ] Empty states handled gracefully

---

## Example Comparison

### Before (Combined Leaderboard):
```
Rank 1: Dance Troupe (Extra) - 120.75 avg
Rank 2: Computer Society (Co) - 85.50 avg
Rank 3: Music Club (Extra) - 95.40 avg
Rank 4: Engineering Society (Co) - 75.20 avg
```

### After (Separate Leaderboards):

**Co-Curricular:**
```
Rank 1: Computer Society - 85.50 avg
Rank 2: Engineering Society - 75.20 avg
```

**Extra-Curricular:**
```
Rank 1: Dance Troupe - 120.75 avg
Rank 2: Music Club - 95.40 avg
```

---

## Related Files

- `mysql/init.sql` - Database procedures
- `node-app/web/models/analyticsModel.js` - Model layer
- `node-app/web/controllers/analyticsController.js` - Controller layer
- `node-app/web/routes/analytics.js` - Route definitions

---

## Summary

The leaderboard system now provides **fair, category-specific rankings** for Co-Curricular and Extra-Curricular organizations. The new endpoint `/analytics/leaderboards-by-category` returns separate, independently ranked lists for each category, while the original endpoint continues to work with enhanced fields. This enables better analytics, fair competition, and improved user experience with direct navigation capabilities.
