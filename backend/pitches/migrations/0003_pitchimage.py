import django.db.models.deletion
import django_mongodb_backend.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pitches", "0002_pitch_created_at_pitch_has_dressing_room_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PitchImage",
            fields=[
                (
                    "id",
                    django_mongodb_backend.fields.ObjectIdAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("image", models.FileField(upload_to="pitch_images/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "pitch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="images",
                        to="pitches.pitch",
                    ),
                ),
            ],
        ),
    ]
