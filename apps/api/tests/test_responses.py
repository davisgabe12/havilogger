import unittest
from datetime import datetime, timezone

from app.main import describe_action, stage_guidance, summarize_actions
from app.schemas import Action, ActionMetadata, CoreActionType


class ResponseFormattingTests(unittest.TestCase):
    def setUp(self):
        self.sleep_action = Action(
            action_type=CoreActionType.SLEEP,
            timestamp=datetime(2024, 1, 10, 13, 0, tzinfo=timezone.utc),
            note=None,
            metadata=ActionMetadata(duration_minutes=120),
            is_core_action=True,
        )

    def test_stage_guidance_mentions_sources_and_context(self):
        text = stage_guidance(
            "what milestones to expect in week 9?",
            {"first_name": "Lev", "timezone": "America/Los_Angeles"},
            [self.sleep_action],
            "sleep",
        )
        self.assertIn("CDC", text)
        self.assertIn("AAP", text)
        self.assertIn("Sleep for 2 hrs", text)

    def test_stage_guidance_requests_profile_when_missing(self):
        text = stage_guidance(
            "what milestones to expect?",
            {"first_name": "Lev", "timezone": "America/Los_Angeles"},
            [],
            "sleep",
        )
        self.assertIn("birth", text.lower())
        self.assertIn("settings", text.lower())

    def test_sleep_duration_uses_hours_label(self):
        summary = describe_action(self.sleep_action, "America/Los_Angeles")
        self.assertIn("Sleep for 2 hrs", summary)
        self.assertTrue("PST" in summary or "PDT" in summary)

    def test_summary_is_conversational(self):
        result = summarize_actions(
            [self.sleep_action],
            {"first_name": "Lev", "timezone": "America/Los_Angeles"},
            {"thin_context": False, "symptom_tags": [], "night_events": 0, "in_catch_up_mode": False},
        )
        self.assertIn("Done!", result)
        self.assertIn("Lev", result)
        self.assertTrue(
            any(
                phrase in result
                for phrase in ["Want me", "Need me", "I’ll keep", "I'll keep", "Happy to"]
            )
        )

    def test_summary_busy_night_follow_up(self):
        result = summarize_actions(
            [self.sleep_action],
            {"first_name": "Lev", "timezone": "America/Los_Angeles"},
            {
                "symptom_tags": [],
                "night_events": 4,
                "thin_context": False,
                "in_catch_up_mode": False,
                "feed_follow_up": None,
            },
        )
        self.assertIn("Busy night", result)


if __name__ == "__main__":
    unittest.main()
