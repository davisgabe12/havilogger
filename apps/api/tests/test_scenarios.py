import unittest
from unittest.mock import patch

from app.schemas import Action
from app.openai_client import generate_actions

BATCH_INPUT = "At 2 am diaper change, 3 am feed 3 oz, then slept until 6"

MOCK_BATCH_RESPONSE = {
    "actions": [
        {
            "action_type": "dirty_diaper_pee",
            "timestamp": "2024-05-01T02:00:00+00:00",
            "note": "2 am diaper change",
            "metadata": {
                "amount_value": None,
                "amount_unit": None,
                "substance": None,
                "measurement_type": None,
                "measurement_unit": None,
                "duration_minutes": None,
                "outcome": None,
                "sleep_type": None,
                "sleep_start_mood": None,
                "sleep_end_mood": None,
                "sleep_location": None,
                "sleep_method": None,
                "stage_context": None,
                "extra": {},
            },
            "is_core_action": True,
            "custom_action_label": None,
        },
        {
            "action_type": "activity",
            "timestamp": "2024-05-01T03:00:00+00:00",
            "note": "3 am feed",
            "metadata": {
                "amount_value": 3,
                "amount_unit": "oz",
                "substance": "formula",
                "measurement_type": None,
                "measurement_unit": None,
                "duration_minutes": None,
                "outcome": None,
                "sleep_type": None,
                "sleep_start_mood": None,
                "sleep_end_mood": None,
                "sleep_location": None,
                "sleep_method": None,
                "stage_context": None,
                "extra": {},
            },
            "is_core_action": True,
            "custom_action_label": None,
        },
        {
            "action_type": "sleep",
            "timestamp": "2024-05-01T06:00:00+00:00",
            "note": "Slept until 6",
            "metadata": {
                "amount_value": None,
                "amount_unit": None,
                "substance": None,
                "measurement_type": None,
                "measurement_unit": None,
                "duration_minutes": 180,
                "outcome": None,
                "sleep_type": "sleep",
                "sleep_start_mood": None,
                "sleep_end_mood": "calm",
                "sleep_location": None,
                "sleep_method": None,
                "stage_context": None,
                "extra": {},
            },
            "is_core_action": True,
            "custom_action_label": None,
        },
    ]
}


class ScenarioTests(unittest.TestCase):
    @patch("app.openai_client._call_chat_completions", return_value=MOCK_BATCH_RESPONSE)
    @patch("app.openai_client.USE_RESPONSES_API", False)
    def test_batch_catch_up(self, *_):
        actions = generate_actions(BATCH_INPUT)
        self.assertEqual(len(actions), 3)
        self.assertEqual(actions[0].action_type, "dirty_diaper_pee")
        self.assertEqual(actions[1].metadata.amount_value, 3)
        self.assertEqual(actions[2].metadata.duration_minutes, 180)


if __name__ == "__main__":
    unittest.main()
