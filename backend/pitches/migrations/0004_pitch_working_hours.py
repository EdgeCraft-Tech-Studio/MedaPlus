from datetime import time
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pitches", "0003_pitchimage"),
    ]

    operations = [
        migrations.AddField(
            model_name="pitch",
            name="opening_time",
            field=models.TimeField(default=time(8, 0)),
        ),
        migrations.AddField(
            model_name="pitch",
            name="closing_time",
            field=models.TimeField(default=time(22, 0)),
        ),
    ]
