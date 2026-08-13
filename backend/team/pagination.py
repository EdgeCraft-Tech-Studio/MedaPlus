from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """Applied to every list endpoint in this app. Without an upper
    bound, 'list all members of this team' is safe today at 25 rows,
    but 'list all public teams' is NOT — once there are 50,000 teams
    in discovery, an unpaginated endpoint means every request for the
    team-discovery screen pulls the entire table. max_page_size caps
    what a client can request even if it tries to override page_size.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
