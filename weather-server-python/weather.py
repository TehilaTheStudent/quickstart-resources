from typing import Any
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("weather")

# --- Huawei Mock DB ---
mock_db = {
    "clusters": [
        {
            "cluster_id": "cluster-1",
            "name": "mock-cluster-1",
            "status": "RUNNING",
            "namespaces": [
                {
                    "namespace": "ns-a",
                    "status": "ACTIVE",
                    "pods": [
                        {
                            "pod_name": "pod-a",
                            "status": "RUNNING",
                            "container_status": "READY",
                            "logs": "[INFO] Pod started successfully.\n[INFO] Service running.\n[INFO] No errors detected."
                        }
                    ]
                },
                {
                    "namespace": "ns-b",
                    "status": "ACTIVE",
                    "pods": [
                        {
                            "pod_name": "pod-b",
                            "status": "CRASHED",
                            "container_status": "TERMINATED",
                            "logs": "[INFO] Pod started.\n[ERROR] Unhandled exception.\n[FATAL] Pod crashed unexpectedly!\n[INFO] Attempting restart..."
                        }
                    ]
                },
                {
                    "namespace": "ns-c",
                    "status": "ACTIVE",
                    "pods": [
                        {
                            "pod_name": "pod-c",
                            "status": "PENDING",
                            "container_status": "WAITING",
                            "logs": "[INFO] Pod created.\n[INFO] Waiting for resources...\n[WARNING] Pod is pending scheduling."
                        }
                    ]
                }
            ]
        },
        {
            "cluster_id": "cluster-2",
            "name": "mock-cluster-2",
            "status": "STOPPED",
            "namespaces": [
                {
                    "namespace": "ns-x",
                    "status": "ACTIVE",
                    "pods": [
                        {
                            "pod_name": "pod-x1",
                            "status": "RUNNING",
                            "container_status": "READY",
                            "logs": "[INFO] Pod started.\n[INFO] Running inference.\n[INFO] Health checks passed."
                        },
                        {
                            "pod_name": "pod-x2",
                            "status": "CRASHED",
                            "container_status": "TERMINATED",
                            "logs": "[INFO] Pod started.\n[WARNING] Memory usage high.\n[ERROR] Segmentation fault.\n[FATAL] Pod crashed."
                        }
                    ]
                },
                {"namespace": "ns-y", "status": "ACTIVE", "pods": []},
                {"namespace": "ns-z", "status": "ACTIVE", "pods": []},
                {"namespace": "ns-empty", "status": "ACTIVE", "pods": []}
            ]
        }
    ]
}

@mcp.tool("get_clusters_by_region_and_project_id", "List all clusters by region and project id.")
async def get_clusters_by_region_and_project_id(region: str, project_id: str) -> list:
    # For the mock, region and project_id are just echoed back
    return [
        {
            "cluster_id": c["cluster_id"],
            "region": region,
            "project_id": project_id,
            "name": c["name"],
            "status": c["status"]
        }
        for c in mock_db["clusters"]
    ]





@mcp.tool("get_namespaces", "List all namespaces in a Huawei CCE cluster.")
async def get_namespaces(region: str, cluster_id: str) -> list:
    for c in mock_db["clusters"]:
        if c["cluster_id"] == cluster_id:
            return [
                {
                    "namespace": ns["namespace"],
                    "cluster_id": cluster_id,
                    "region": region,
                    "status": ns["status"]
                }
                for ns in c["namespaces"]
            ]
    return []




@mcp.tool("get_pods_by_namespace", "List all pods in a namespace in a Huawei CCE cluster.")
async def get_pods_by_namespace(region: str, cluster_id: str, namespace: str) -> list:
    for c in mock_db["clusters"]:
        if c["cluster_id"] == cluster_id:
            for ns in c["namespaces"]:
                if ns["namespace"] == namespace:
                    pods = ns["pods"]
                    # Add cluster_id, region, namespace to each pod for consistency
                    return [
                        {
                            **pod,
                            "namespace": namespace,
                            "cluster_id": cluster_id,
                            "region": region
                        }
                        for pod in pods
                    ]
    return []

@mcp.tool("get_pod_logs_by_pod_name_and_namespace_name", "Get logs for a specific pod by pod name and namespace name.")
async def get_pod_logs_by_pod_name_and_namespace_name(cluster_id: str, namespace: str, pod_name: str) -> dict:
    for c in mock_db["clusters"]:
        if c["cluster_id"] == cluster_id:
            for ns in c["namespaces"]:
                if ns["namespace"] == namespace:
                    for pod in ns["pods"]:
                        if pod["pod_name"] == pod_name:
                            return {
                                "pod_name": pod_name,
                                "namespace": namespace,
                                "cluster_id": cluster_id,
                                "logs": pod.get("logs", "[INFO] No logs found.")
                            }
    return {"error": "Pod not found"}



if __name__ == "__main__":
    # Initialize and run the server
    mcp.run(transport='stdio')
