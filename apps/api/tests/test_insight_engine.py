import unittest

from app.insight_engine import expected_ranges, summaries_from_actions


class InsightEngineTests(unittest.TestCase):
    def test_summaries_with_sleep_and_feed(self):
        actions = [
            {
                "action_type": "sleep",
                "metadata": {"duration_minutes": 90},
            },
            {
                "action_type": "activity",
                "metadata": {"amount_value": 4},
            },
            {
                "action_type": "activity",
                "metadata": {"amount_value": 3},
            },
        ]
        summary = summaries_from_actions(actions)
        self.assertEqual(summary["count_sleep"], 1)
        self.assertEqual(summary["count_activity"], 2)
        self.assertEqual(summary["sleep_minutes"], 90)
        self.assertEqual(summary["feed_oz"], 7)

    def test_expected_ranges_flags_low_sleep(self):
        observed = {"sleep_minutes": 600, "count_activity": 5, "count_dirty_diaper_poop": 0}
        result = expected_ranges("month_3", observed)
        self.assertIn("sleep", " ".join(result["risks"]).lower())
        self.assertTrue(result["options"])


if __name__ == "__main__":
    unittest.main()
